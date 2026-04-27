/**
 * useStream.ts -- Voix, caméra et partage d'écran -- 100% P2P
 *
 * Signaling WebRTC via GunDB :
 *   gun.get('webrtc_signal').get(targetUserId).get(signalId)
 *
 * Présence vocale/stream via GunDB :
 *   gun.get('voice_presence').get(channelId).get(username) -> { active, ts }
 *
 * Reconnexion automatique :
 *   - onconnectionstatechange détecte 'failed' / 'disconnected'
 *   - backoff exponentiel : 1s → 2s → 4s → 8s (max 8s)
 *   - abandonné si leaveVoice() est appelé entre-temps
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

  // Compteurs de tentatives de reconnexion par peer
  const reconnectAttempts = useRef<Record<string, number>>({})
  const reconnectTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // ── Signal WebRTC via GunDB ──────────────────────────────────────
  const sendSignal = (targetId: string, payload: object) => {
    const signalId = `${username}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    gun.get('webrtc_signal').get(targetId).get(signalId).put({
      from: username,
      ts: Date.now(),
      ...payload
    })
  }

  // ── Reconnexion avec backoff exponentiel ─────────────────────────
  const scheduleReconnect = (peerId: string) => {
    // Si on n'est plus dans un channel vocal, on abandonne
    if (!currentVoiceRoom.current) return

    const attempts = reconnectAttempts.current[peerId] ?? 0
    if (attempts >= RECONNECT_DELAYS.length) {
      // Trop de tentatives — on considère le pair comme parti
      console.warn(`[Mesh Voice] Pair ${peerId} injoignable après ${attempts} tentatives`)
      setVoiceUsers(prev => prev.filter(u => u.id !== peerId))
      delete reconnectAttempts.current[peerId]
      return
    }

    const delay = RECONNECT_DELAYS[attempts]
    console.log(`[Mesh Voice] Reconnexion vers ${peerId} dans ${delay}ms (tentative ${attempts + 1})`)

    reconnectTimers.current[peerId] = setTimeout(async () => {
      if (!currentVoiceRoom.current) return // leaveVoice() appelé entre-temps
      reconnectAttempts.current[peerId] = attempts + 1

      try {
        const peer = createVoicePeer(peerId)
        const offer = await peer.createOffer()
        await peer.setLocalDescription(offer)
        sendSignal(peerId, { type: 'offer_voice', sdp: offer.sdp })
      } catch (e) {
        console.error(`[Mesh Voice] Échec reconnexion ${peerId}:`, e)
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

  // ── Création d'un peer WebRTC vocal ──────────────────────────────
  const createVoicePeer = (peerId: string) => {
    // Fermer proprement l'ancienne connexion si elle existe
    if (voicePeers.current[peerId]) {
      voicePeers.current[peerId].onconnectionstatechange = null
      voicePeers.current[peerId].close()
      delete voicePeers.current[peerId]
    }

    const peer = new RTCPeerConnection({ iceServers: STUN_SERVERS })
    voicePeers.current[peerId] = peer

    // Ajouter le micro local si disponible
    if (localAudioStream.current) {
      localAudioStream.current.getAudioTracks().forEach(track => {
        peer.addTrack(track, localAudioStream.current!)
      })
    }

    // Réception audio distant
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

    // ICE candidates
    peer.onicecandidate = (e) => {
      if (e.candidate) {
        sendSignal(peerId, { type: 'ice_voice', candidate: e.candidate.toJSON() })
      }
    }

    // Reconnexion automatique sur déconnexion/échec
    peer.onconnectionstatechange = () => {
      const state = peer.connectionState
      console.log(`[Mesh Voice] ${peerId} → ${state}`)

      if (state === 'connected') {
        // Connexion établie : réinitialiser le compteur de tentatives
        cancelReconnect(peerId)
        reconnectAttempts.current[peerId] = 0
      } else if (state === 'failed' || state === 'disconnected') {
        // Nettoyer l'audio distant
        if (remoteAudios.current[peerId]) {
          remoteAudios.current[peerId].srcObject = null
          delete remoteAudios.current[peerId]
        }
        peer.close()
        delete voicePeers.current[peerId]
        // Tenter la reconnexion si on est encore dans le channel
        scheduleReconnect(peerId)
      } else if (state === 'closed') {
        cancelReconnect(peerId)
      }
    }

    return peer
  }

  // ── Écoute des signaux entrants ──────────────────────────────────
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
          // Un pair nous envoie une offre — on répond
          const peer = createVoicePeer(fromId)
          await peer.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: data.sdp }))
          const answer = await peer.createAnswer()
          await peer.setLocalDescription(answer)
          sendSignal(fromId, { type: 'answer_voice', sdp: answer.sdp })
          // Connexion entrante réussie : reset tentatives
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

      // Nettoyer le signal après traitement
      setTimeout(() => {
        mySignals.get(signalId).put(null)
        processedSignals.delete(signalId)
      }, 5000)
    })

    return () => {
      mySignals.map().off()
    }
  }, [username])

  // ── Présence stream (partage d'écran) ────────────────────────────
  useEffect(() => {
    const streamPresence = gun.get('stream_presence')
    streamPresence.map().on((data: any, user: string) => {
      if (!user || user === username) return
      if (data && data.active === true && (Date.now() - (data.ts || 0)) < 15000) {
        setStreamers(prev => prev.find(s => s.id === user) ? prev : [...prev, { id: user, username: user }])
      } else {
        setStreamers(prev => prev.filter(s => s.id !== user))
        setWatchingStream(prev => prev === user ? null : prev)
      }
    })

    const heartbeat = setInterval(() => {
      if (isStreamingRef.current) {
        gun.get('stream_presence').get(username).put({ active: true, ts: Date.now() })
      }
    }, 5000)

    return () => {
      streamPresence.map().off()
      clearInterval(heartbeat)
    }
  }, [username])

  // ── Partage d'écran ──────────────────────────────────────────────
  const startStream = async (constraints: StreamConstraints) => {
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

      gun.get('stream_presence').get(username).put({ active: true, ts: Date.now() })
      setIsStreaming(true)
      stream.getVideoTracks()[0].addEventListener('ended', () => stopStream())
    } catch (e) {
      console.error('[Mesh] Erreur capture écran:', e)
      alert("Impossible de capturer l'écran. Vérifie les permissions.")
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
    gun.get('stream_presence').get(username).put({ active: false, ts: Date.now() })
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

  // ── Caméra ───────────────────────────────────────────────────────
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
      } catch {
        alert("Impossible d'accéder à la caméra !")
      }
    }
  }

  // ── Rejoindre un channel vocal ───────────────────────────────────
  const joinVoice = async (channelId: string, _userLimit?: number) => {
    currentVoiceRoom.current = channelId
    setVoiceFull(false)
    setVoiceUsers([{ id: username, username }])

    joinMeshRoom(`voice_${channelId}`)

    // MICRO EN PREMIER — createVoicePeer() appelle addTrack() sur localAudioStream
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

    // Publier notre présence puis écouter les autres
    gun.get('voice_presence').get(channelId).get(username).put({ active: true, ts: Date.now() })

    gun.get('voice_presence').get(channelId).map().on(async (data: any, user: string) => {
      if (!user || user === username) return
      const isActive = data && data.active === true && (Date.now() - (data.ts || 0)) < 15000

      if (isActive) {
        setVoiceUsers(prev => prev.find(u => u.id === user) ? prev : [...prev, { id: user, username: user }])
        // Initier la connexion seulement si pas déjà connecté
        if (!voicePeers.current[user]) {
          try {
            const peer = createVoicePeer(user)
            const offer = await peer.createOffer()
            await peer.setLocalDescription(offer)
            sendSignal(user, { type: 'offer_voice', sdp: offer.sdp })
          } catch (e) {
            console.error('[Mesh Voice] Erreur offre initiale:', e)
          }
        }
      } else {
        // Pair parti proprement (active: false) — annuler tout retry en cours
        cancelReconnect(user)
        setVoiceUsers(prev => prev.filter(u => u.id !== user))
        if (voicePeers.current[user]) {
          voicePeers.current[user].onconnectionstatechange = null
          voicePeers.current[user].close()
          delete voicePeers.current[user]
        }
        if (remoteAudios.current[user]) {
          remoteAudios.current[user].srcObject = null
          delete remoteAudios.current[user]
        }
      }
    })

    // Heartbeat de présence toutes les 5s
    const hb = setInterval(() => {
      if (currentVoiceRoom.current === channelId) {
        gun.get('voice_presence').get(channelId).get(username).put({ active: true, ts: Date.now() })
      } else {
        clearInterval(hb)
      }
    }, 5000)
    ;(window as any)[`_vhb_${channelId}`] = hb
  }

  // ── Quitter un channel vocal ─────────────────────────────────────
  const leaveVoice = (channelId?: string) => {
    const room = channelId || currentVoiceRoom.current

    // Annuler tous les timers de reconnexion avant de fermer
    Object.keys(reconnectTimers.current).forEach(cancelReconnect)

    if (room) {
      gun.get('voice_presence').get(room).get(username).put({ active: false, ts: Date.now() })
      gun.get('voice_presence').get(room).map().off()
      leaveMeshRoom(`voice_${room}`)
      const hbKey = `_vhb_${room}`
      if ((window as any)[hbKey]) {
        clearInterval((window as any)[hbKey])
        delete (window as any)[hbKey]
      }
    }

    currentVoiceRoom.current = null
    setVoiceUsers([])

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
    videoRef, startStream, stopStream, watchStream, stopWatching,
    isCameraOn, cameraVideoRef, toggleCamera,
    voiceUsers, voiceFull, joinVoice, leaveVoice,
    isMuted, isDeafened, toggleMute, toggleDeafen,
    remoteAudios,
    localAudioStream,
  }
}

export default useStream
