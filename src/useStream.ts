/**
 * useStream.ts -- Voix, camera et partage d'ecran -- 100% P2P
 *
 * Signaling WebRTC via GunDB (exception autorisee) :
 *   gun.get('webrtc_signal').get(targetUserId).get(signalId)
 *
 * Presence vocale via Trystero makeAction('voice_presence') :
 *   Remplace gun.get('voice_presence') qui ne se synchronise pas cross-machine
 *   car GunDB a peers:[] (cache local uniquement)
 *
 * Reconnexion automatique :
 *   - onconnectionstatechange detecte 'failed' / 'disconnected'
 *   - backoff exponentiel : 1s -> 2s -> 4s -> 8s (max 8s)
 *   - abandonne si leaveVoice() est appele entre-temps
 */

import { useEffect, useRef, useState } from 'react'
import gun from './gun'
import { joinMeshRoom, leaveMeshRoom } from './mesh'
import type { StreamConstraints } from './types'

const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.mozilla.org' },
]

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000]

// Duree max d'un signal WebRTC avant purge (60s)
const SIGNAL_MAX_AGE_MS = 60_000

function useStream(username: string, voiceSettings?: {
  micDeviceId?: string
  camDeviceId?: string
  inputVolume?: number
  outputVolume?: number
}) {
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamers, setStreamers] = useState<{ id: string; username: string }[]>([])
  const [watchingStream, setWatchingStream] = useState<string | null>(null)
  const [isCameraOn, setIsCameraOn] = useState(false)
  const [voiceUsers, setVoiceUsers] = useState<{ id: string; username: string }[]>([])
  const [voiceFull, setVoiceFull] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isDeafened, setIsDeafened] = useState(false)

  const screenStream = useRef<MediaStream | null>(null)
  const cameraStream = useRef<MediaStream | null>(null)
  const localAudioStream = useRef<MediaStream | null>(null)

  const voicePeers = useRef<Record<string, RTCPeerConnection>>({})
  const streamPeers = useRef<Record<string, RTCPeerConnection>>({})
  const remoteAudios = useRef<Record<string, HTMLAudioElement>>({})

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null)
  const currentVoiceRoom = useRef<string | null>(null)
  const isMutedRef = useRef(false)
  const isDeafenedRef = useRef(false)
  const isStreamingRef = useRef(false)

  // Fonctions Trystero pour presence vocale (initialisees dans joinVoice)
  const sendVoicePresenceFn = useRef<((p: object) => void) | null>(null)

  // Compteurs de tentatives de reconnexion par peer
  const reconnectAttempts = useRef<Record<string, number>>({})
  const reconnectTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // ── Signal WebRTC via GunDB (autorise : cross-machine signaling) ─
  const sendSignal = (targetId: string, payload: object) => {
    const signalId = `${username}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    gun.get('webrtc_signal').get(targetId).get(signalId).put({
      from: username,
      ts: Date.now(),
      ...payload
    })
  }

  // ── Purge des signaux WebRTC orphelins au demarrage ──────────────
  useEffect(() => {
    if (!username) return
    const now = Date.now()
    gun.get('webrtc_signal').get(username).map().once((data: any, signalId: string) => {
      if (!data || !signalId) return
      if (now - (data.ts || 0) > SIGNAL_MAX_AGE_MS) {
        gun.get('webrtc_signal').get(username).get(signalId).put(null)
      }
    })
  }, [username])

  // ── Reconnexion avec backoff exponentiel ─────────────────────────
  const scheduleReconnect = (peerId: string) => {
    if (!currentVoiceRoom.current) return

    const attempts = reconnectAttempts.current[peerId] ?? 0
    if (attempts >= RECONNECT_DELAYS.length) {
      console.warn(`[Mesh Voice] Pair ${peerId} injoignable apres ${attempts} tentatives`)
      setVoiceUsers(prev => prev.filter(u => u.id !== peerId))
      delete reconnectAttempts.current[peerId]
      return
    }

    const delay = RECONNECT_DELAYS[attempts]
    console.log(`[Mesh Voice] Reconnexion vers ${peerId} dans ${delay}ms (tentative ${attempts + 1})`)

    reconnectTimers.current[peerId] = setTimeout(async () => {
      if (!currentVoiceRoom.current) return
      reconnectAttempts.current[peerId] = attempts + 1

      try {
        const peer = createVoicePeer(peerId)
        const offer = await peer.createOffer()
        await peer.setLocalDescription(offer)
        sendSignal(peerId, { type: 'offer_voice', sdp: offer.sdp })
      } catch (e) {
        console.error(`[Mesh Voice] Echec reconnexion ${peerId}:`, e)
        scheduleReconnect(peerId)
      }
    }, delay)
  }

  const cancelReconnect = (peerId: string) => {
    if (reconnectTimers.current[peerId]) {
      clearTimeout(reconnectTimers.current[peerId])
      delete reconnectTimers.current[peerId]
    }
    delete reconnectAttempts.current[peerId]
  }

  // ── Creation d'un peer WebRTC vocal ──────────────────────────────
  const createVoicePeer = (peerId: string) => {
    if (voicePeers.current[peerId]) {
      voicePeers.current[peerId].onconnectionstatechange = null
      voicePeers.current[peerId].close()
      delete voicePeers.current[peerId]
    }

    const peer = new RTCPeerConnection({ iceServers: STUN_SERVERS })
    voicePeers.current[peerId] = peer

    if (localAudioStream.current) {
      localAudioStream.current.getAudioTracks().forEach(track => {
        peer.addTrack(track, localAudioStream.current!)
      })
    }

    peer.ontrack = (e) => {
      if (isDeafenedRef.current) return
      let audio = remoteAudios.current[peerId]
      if (!audio) {
        audio = new Audio()
        audio.autoplay = true
        remoteAudios.current[peerId] = audio
      }
      audio.srcObject = e.streams[0]
      audio.volume = Math.min(1, (voiceSettings?.outputVolume ?? 100) / 100)
      audio.play().catch(() => {})
    }

    peer.onicecandidate = (e) => {
      if (e.candidate) {
        sendSignal(peerId, { type: 'ice_voice', candidate: e.candidate.toJSON() })
      }
    }

    peer.onconnectionstatechange = () => {
      const state = peer.connectionState
      console.log(`[Mesh Voice] ${peerId} -> ${state}`)

      if (state === 'connected') {
        cancelReconnect(peerId)
        reconnectAttempts.current[peerId] = 0
      } else if (state === 'failed' || state === 'disconnected') {
        if (remoteAudios.current[peerId]) {
          remoteAudios.current[peerId].srcObject = null
          delete remoteAudios.current[peerId]
        }
        peer.close()
        delete voicePeers.current[peerId]
        scheduleReconnect(peerId)
      } else if (state === 'closed') {
        cancelReconnect(peerId)
      }
    }

    return peer
  }

  // ── Ecoute des signaux WebRTC entrants (GunDB) ───────────────────
  useEffect(() => {
    if (!username) return

    const mySignals = gun.get('webrtc_signal').get(username)
    const processedSignals = new Set<string>()

    mySignals.map().on(async (data: any, signalId: string) => {
      if (!data || !data.from || !data.type) return
      if (processedSignals.has(signalId)) return
      if (Date.now() - (data.ts || 0) > 30000) return
      processedSignals.add(signalId)

      const fromId = data.from

      try {
        if (data.type === 'offer_voice') {
          const peer = createVoicePeer(fromId)
          await peer.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: data.sdp }))
          const answer = await peer.createAnswer()
          await peer.setLocalDescription(answer)
          sendSignal(fromId, { type: 'answer_voice', sdp: answer.sdp })
          reconnectAttempts.current[fromId] = 0

        } else if (data.type === 'answer_voice') {
          const peer = voicePeers.current[fromId]
          if (peer && peer.signalingState !== 'closed') {
            await peer.setRemoteDescription(
              new RTCSessionDescription({ type: 'answer', sdp: data.sdp })
            ).catch(e => console.warn('[Mesh Voice] setRemoteDescription answer:', e))
          }

        } else if (data.type === 'ice_voice') {
          const peer = voicePeers.current[fromId]
          if (peer && peer.signalingState !== 'closed' && data.candidate) {
            await peer.addIceCandidate(
              new RTCIceCandidate(data.candidate)
            ).catch(e => console.warn('[Mesh Voice] addIceCandidate:', e))
          }

        } else if (data.type === 'watch_request') {
          if (!isStreamingRef.current || !screenStream.current) return
          const peer = new RTCPeerConnection({ iceServers: STUN_SERVERS })
          streamPeers.current[fromId] = peer
          screenStream.current.getTracks().forEach(track => peer.addTrack(track, screenStream.current!))
          peer.onicecandidate = (e) => {
            if (e.candidate) sendSignal(fromId, { type: 'ice_stream', candidate: e.candidate.toJSON() })
          }
          const offer = await peer.createOffer()
          await peer.setLocalDescription(offer)
          sendSignal(fromId, { type: 'offer_stream', sdp: offer.sdp })

        } else if (data.type === 'offer_stream') {
          const peer = new RTCPeerConnection({ iceServers: STUN_SERVERS })
          streamPeers.current[fromId] = peer
          peer.ontrack = (e) => {
            if (videoRef.current) {
              videoRef.current.srcObject = e.streams[0]
              videoRef.current.play().catch(() => {})
            }
          }
          peer.onicecandidate = (e) => {
            if (e.candidate) sendSignal(fromId, { type: 'ice_stream', candidate: e.candidate.toJSON() })
          }
          await peer.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: data.sdp }))
          const answer = await peer.createAnswer()
          await peer.setLocalDescription(answer)
          sendSignal(fromId, { type: 'answer_stream', sdp: answer.sdp })

        } else if (data.type === 'answer_stream') {
          const peer = streamPeers.current[fromId]
          if (peer) await peer.setRemoteDescription(
            new RTCSessionDescription({ type: 'answer', sdp: data.sdp })
          ).catch(() => {})

        } else if (data.type === 'ice_stream') {
          const peer = streamPeers.current[fromId]
          if (peer && data.candidate) await peer.addIceCandidate(
            new RTCIceCandidate(data.candidate)
          ).catch(() => {})
        }
      } catch (err) {
        console.error('[Mesh Voice] Erreur traitement signal:', err)
      }

      setTimeout(() => {
        mySignals.get(signalId).put(null)
        processedSignals.delete(signalId)
      }, 5000)
    })

    return () => {
      mySignals.map().off()
    }
  }, [username])

  // ── Presence stream partage d'ecran via Trystero (cross-machine) ─
  // sendStreamPresenceFn est initialise dans joinVoice/startStream
  // On stocke une ref pour pouvoir l'appeler depuis startStream/stopStream
  const sendStreamPresenceFn = useRef<((p: object) => void) | null>(null)
  const streamRoomRef = useRef<string | null>(null)

  const setupStreamPresence = (channelId: string) => {
    streamRoomRef.current = channelId
    const room = joinMeshRoom(`stream_${channelId}`)
    if (!room) return

    const [sendPresence, getPresence] = (room.makeAction as any)('stream_presence') as [any, any]
    sendStreamPresenceFn.current = (p: object) => { try { sendPresence(p) } catch (_e) {} }

    getPresence((data: any) => {
      if (!data?.user || data.user === username) return
      if (data.active === true) {
        setStreamers(prev => prev.find(s => s.id === data.user) ? prev : [...prev, { id: data.user, username: data.user }])
      } else {
        setStreamers(prev => prev.filter(s => s.id !== data.user))
        setWatchingStream(prev => prev === data.user ? null : prev)
      }
    })

    // Heartbeat toutes les 5s
    const heartbeat = setInterval(() => {
      if (isStreamingRef.current) {
        sendStreamPresenceFn.current?.({ user: username, active: true, ts: Date.now() })
      }
    }, 5000)
    ;(window as any)[`_shb_${channelId}`] = heartbeat
  }

  const teardownStreamPresence = (channelId: string) => {
    const hbKey = `_shb_${channelId}`
    if ((window as any)[hbKey]) {
      clearInterval((window as any)[hbKey])
      delete (window as any)[hbKey]
    }
    sendStreamPresenceFn.current = null
    streamRoomRef.current = null
  }

  // ── Partage d'ecran ──────────────────────────────────────────────
  const startStream = async (constraints: StreamConstraints, channelId?: string) => {
    try {
      let stream: MediaStream
      if (constraints.sourceId) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            // @ts-ignore
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: constraints.sourceId,
              maxWidth: constraints.width,
              maxHeight: constraints.height,
              maxFrameRate: constraints.frameRate,
            }
          }
        })
      } else {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: constraints.width },
            height: { ideal: constraints.height },
            frameRate: { ideal: constraints.frameRate }
          },
          audio: true
        })
      }
      screenStream.current = stream
      isStreamingRef.current = true

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play().catch(() => {})
      }

      // Annoncer via Trystero (cross-machine) — canal vocal courant ou channelId fourni
      const ch = channelId || currentVoiceRoom.current
      if (ch) {
        if (!streamRoomRef.current) setupStreamPresence(ch)
        sendStreamPresenceFn.current?.({ user: username, active: true, ts: Date.now() })
      }

      setIsStreaming(true)
      stream.getVideoTracks()[0].addEventListener('ended', () => stopStream())
    } catch (e) {
      console.error('[Mesh] Erreur capture ecran:', e)
      alert("Impossible de capturer l'ecran. Verifie les permissions.")
    }
  }

  const stopStream = () => {
    if (screenStream.current) {
      screenStream.current.getTracks().forEach(t => t.stop())
      screenStream.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    Object.values(streamPeers.current).forEach(p => p.close())
    streamPeers.current = {}
    isStreamingRef.current = false
    // Annoncer arrêt via Trystero (cross-machine)
    sendStreamPresenceFn.current?.({ user: username, active: false, ts: Date.now() })
    if (streamRoomRef.current) teardownStreamPresence(streamRoomRef.current)
    setIsStreaming(false)
  }

  const watchStream = (streamerId: string) => {
    setWatchingStream(streamerId)
    sendSignal(streamerId, { type: 'watch_request' })
  }

  const stopWatching = () => {
    if (videoRef.current) videoRef.current.srcObject = null
    setWatchingStream(null)
  }

  // ── Camera ───────────────────────────────────────────────────────
  const toggleCamera = async () => {
    if (isCameraOn) {
      if (cameraStream.current) {
        cameraStream.current.getTracks().forEach(t => t.stop())
        cameraStream.current = null
      }
      if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null
      setIsCameraOn(false)
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        cameraStream.current = stream
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = stream
          cameraVideoRef.current.play().catch(() => {})
        }
        setIsCameraOn(true)
      } catch (_e) {
        alert("Impossible d'acceder a la camera !")
      }
    }
  }

  // ── Rejoindre un channel vocal ───────────────────────────────────
  const joinVoice = async (channelId: string, _userLimit?: number) => {
    currentVoiceRoom.current = channelId
    setVoiceFull(false)
    setVoiceUsers([{ id: username, username }])

    // Rejoindre la room Trystero pour la presence vocale
    const voiceRoom = joinMeshRoom(`voice_${channelId}`)

    if (voiceRoom) {
      const [sendPresence, getPresence] = (voiceRoom.makeAction as any)('voice_presence') as [any, any]
      sendVoicePresenceFn.current = sendPresence

      // Ecouter la presence des autres
      getPresence((data: any) => {
        if (!data?.user || data.user === username) return
        if (data.active) {
          setVoiceUsers(prev => prev.find(u => u.id === data.user) ? prev : [...prev, { id: data.user, username: data.user }])
          // Initier connexion WebRTC si pas deja connecte
          if (!voicePeers.current[data.user]) {
            createVoicePeer(data.user)
              .createOffer()
              .then(async offer => {
                await voicePeers.current[data.user]?.setLocalDescription(offer)
                sendSignal(data.user, { type: 'offer_voice', sdp: offer.sdp })
              })
              .catch(e => console.error('[Mesh Voice] Erreur offre initiale:', e))
          }
        } else {
          cancelReconnect(data.user)
          setVoiceUsers(prev => prev.filter(u => u.id !== data.user))
          if (voicePeers.current[data.user]) {
            voicePeers.current[data.user].onconnectionstatechange = null
            voicePeers.current[data.user].close()
            delete voicePeers.current[data.user]
          }
          if (remoteAudios.current[data.user]) {
            remoteAudios.current[data.user].srcObject = null
            delete remoteAudios.current[data.user]
          }
        }
      })
    }

    // Initialiser la presence stream pour ce channel vocal (cross-machine)
    setupStreamPresence(channelId)

    // MICRO
    try {
      const audioConstraints: MediaTrackConstraints = voiceSettings?.micDeviceId
        ? { deviceId: { exact: voiceSettings.micDeviceId } }
        : true as any
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false })
      localAudioStream.current = stream
      stream.getAudioTracks().forEach(t => { t.enabled = !isMutedRef.current })
    } catch (e) {
      console.warn('[Mesh Voice] Pas de micro disponible:', e)
    }

    // Annoncer notre presence via Trystero
    sendVoicePresenceFn.current?.({ user: username, active: true })

    // Heartbeat de presence toutes les 5s via Trystero
    const hb = setInterval(() => {
      if (currentVoiceRoom.current === channelId) {
        sendVoicePresenceFn.current?.({ user: username, active: true })
      } else {
        clearInterval(hb)
      }
    }, 5000)
    ;(window as any)[`_vhb_${channelId}`] = hb
  }

  // ── Quitter un channel vocal ─────────────────────────────────────
  const leaveVoice = (channelId?: string) => {
    const room = channelId || currentVoiceRoom.current

    Object.keys(reconnectTimers.current).forEach(cancelReconnect)

    if (room) {
      // Annoncer depart via Trystero
      sendVoicePresenceFn.current?.({ user: username, active: false })
      sendVoicePresenceFn.current = null
      leaveMeshRoom(`voice_${room}`)
      const hbKey = `_vhb_${room}`
      if ((window as any)[hbKey]) {
        clearInterval((window as any)[hbKey])
        delete (window as any)[hbKey]
      }
    }

    currentVoiceRoom.current = null
    setVoiceUsers([])

    // Teardown stream presence si on quitte le channel
    if (room && streamRoomRef.current === `stream_${room}`) {
      teardownStreamPresence(room)
    }

    Object.values(voicePeers.current).forEach(p => {
      p.onconnectionstatechange = null
      p.close()
    })
    voicePeers.current = {}

    Object.values(remoteAudios.current).forEach(a => { a.srcObject = null })
    remoteAudios.current = {}

    if (localAudioStream.current) {
      localAudioStream.current.getTracks().forEach(t => t.stop())
      localAudioStream.current = null
    }
  }

  // ── Mute / Sourdine ──────────────────────────────────────────────
  const toggleMute = () => {
    const next = !isMuted
    setIsMuted(next)
    isMutedRef.current = next
    if (localAudioStream.current) {
      localAudioStream.current.getAudioTracks().forEach(t => { t.enabled = !next })
    }
  }

  const toggleDeafen = () => {
    const next = !isDeafened
    setIsDeafened(next)
    isDeafenedRef.current = next
    Object.values(remoteAudios.current).forEach(a => { a.muted = next })
    if (next && !isMuted) {
      setIsMuted(true)
      isMutedRef.current = true
      if (localAudioStream.current) {
        localAudioStream.current.getAudioTracks().forEach(t => { t.enabled = false })
      }
    }
  }

  return {
    isStreaming, streamers, watchingStream,
    videoRef, screenStream, startStream, stopStream, watchStream, stopWatching,
    isCameraOn, cameraVideoRef, toggleCamera,
    voiceUsers, voiceFull, joinVoice, leaveVoice,
    isMuted, isDeafened, toggleMute, toggleDeafen,
    remoteAudios,
    localAudioStream,
  }
}

export default useStream
