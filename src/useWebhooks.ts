/**
 * useWebhooks.ts — Stub P2P
 *
 * Les webhooks nécessitent un serveur HTTP pour recevoir des POSTs externes.
 * Dans l'architecture P2P Mesh (zéro serveur), cette fonctionnalité n'est pas
 * disponible. Le hook retourne des données vides sans erreur.
 */

export interface Webhook {
  name: string
  token: string
  url: string
}

function useWebhooks(_serverId: string, _channelId: string) {
  return {
    webhooks: [] as Webhook[],
    loading: false,
    createWebhook: async (_name: string) => null,
    deleteWebhook: async (_token: string) => {},
  }
}

export default useWebhooks
