export type NodeCategory = 'trigger' | 'condition' | 'action' | 'variable' | 'utility'

export interface ConfigField {
  key: string
  label: string
  type: 'text' | 'number' | 'select' | 'textarea'
  options?: string[]
  placeholder?: string
  default?: string | number
}

export interface NodeDef {
  label: string
  icon: string
  category: NodeCategory
  description: string
  configFields: ConfigField[]
}

export const NODE_DEFS: Record<string, NodeDef> = {
  // ── TRIGGERS ──────────────────────────────────────────────────
  trigger_message: {
    label: 'Message reçu', icon: '💬', category: 'trigger',
    description: 'Se déclenche quand un message est envoyé',
    configFields: [
      { key: 'channel', label: 'Salon (vide = tous)', type: 'text', placeholder: 'général' },
    ]
  },
  trigger_command: {
    label: 'Commande reçue', icon: '/', category: 'trigger',
    description: 'Se déclenche sur une commande spécifique',
    configFields: [
      { key: 'prefix', label: 'Préfixe', type: 'text', placeholder: '!help', default: '!' },
    ]
  },
  trigger_member_join: {
    label: 'Membre rejoint', icon: '👋', category: 'trigger',
    description: 'Se déclenche quand un membre rejoint le serveur',
    configFields: []
  },
  trigger_member_leave: {
    label: 'Membre parti', icon: '🚪', category: 'trigger',
    description: 'Se déclenche quand un membre quitte le serveur',
    configFields: []
  },
  trigger_reaction: {
    label: 'Réaction ajoutée', icon: '😊', category: 'trigger',
    description: 'Se déclenche sur une réaction',
    configFields: [
      { key: 'emoji', label: 'Emoji (vide = tous)', type: 'text', placeholder: '👍' },
    ]
  },
  trigger_timer: {
    label: 'Timer', icon: '⏰', category: 'trigger',
    description: 'Se déclenche à intervalle régulier',
    configFields: [
      { key: 'interval', label: 'Intervalle (minutes)', type: 'number', default: 60 },
      { key: 'channel', label: 'Salon cible', type: 'text', placeholder: 'général' },
    ]
  },
  trigger_voice_join: {
    label: 'Rejoint vocal', icon: '🔊', category: 'trigger',
    description: 'Se déclenche quand un membre rejoint un salon vocal',
    configFields: []
  },

  // ── CONDITIONS ────────────────────────────────────────────────
  condition_contains: {
    label: 'Contient texte', icon: '🔍', category: 'condition',
    description: 'Vérifie si le message contient un texte',
    configFields: [
      { key: 'text', label: 'Texte à chercher', type: 'text', placeholder: 'bonjour' },
      { key: 'mode', label: 'Mode', type: 'select', options: ['partiel', 'exact', 'regex'], default: 'partiel' },
    ]
  },
  condition_has_role: {
    label: 'A le rôle', icon: '🎭', category: 'condition',
    description: "Vérifie si l'auteur a un rôle spécifique",
    configFields: [
      { key: 'role', label: 'Nom du rôle', type: 'text', placeholder: 'admin' },
    ]
  },
  condition_in_channel: {
    label: 'Dans le salon', icon: '#', category: 'condition',
    description: 'Vérifie si le message est dans un salon spécifique',
    configFields: [
      { key: 'channel', label: 'Salon', type: 'text', placeholder: 'général' },
    ]
  },
  condition_variable: {
    label: 'Variable = valeur', icon: '📊', category: 'condition',
    description: 'Compare une variable à une valeur',
    configFields: [
      { key: 'name', label: 'Nom de la variable', type: 'text', placeholder: 'compteur' },
      { key: 'operator', label: 'Opérateur', type: 'select', options: ['=', '≠', '>', '<', '≥', '≤'], default: '=' },
      { key: 'value', label: 'Valeur', type: 'text', placeholder: '10' },
    ]
  },
  condition_cooldown: {
    label: 'Cooldown', icon: '⏱️', category: 'condition',
    description: "Limite la fréquence d'exécution",
    configFields: [
      { key: 'seconds', label: 'Secondes entre exécutions', type: 'number', default: 60 },
    ]
  },
  condition_and: {
    label: 'ET logique', icon: '&&', category: 'condition',
    description: 'Vrai si les deux entrées sont vraies',
    configFields: []
  },
  condition_or: {
    label: 'OU logique', icon: '||', category: 'condition',
    description: "Vrai si au moins une entrée est vraie",
    configFields: []
  },

  // ── ACTIONS ───────────────────────────────────────────────────
  action_send_message: {
    label: 'Envoyer message', icon: '📤', category: 'action',
    description: 'Envoie un message dans un salon',
    configFields: [
      { key: 'channel', label: 'Salon', type: 'text', placeholder: 'général' },
      { key: 'text', label: 'Message', type: 'textarea', placeholder: 'Bienvenue {username} !' },
    ]
  },
  action_send_dm: {
    label: 'Envoyer DM', icon: '✉️', category: 'action',
    description: "Envoie un message privé à l'auteur",
    configFields: [
      { key: 'text', label: 'Message', type: 'textarea', placeholder: 'Bonjour {username} !' },
    ]
  },
  action_add_role: {
    label: 'Assigner rôle', icon: '➕', category: 'action',
    description: "Assigne un rôle à l'auteur",
    configFields: [
      { key: 'role', label: 'Nom du rôle', type: 'text', placeholder: 'VIP' },
    ]
  },
  action_remove_role: {
    label: 'Retirer rôle', icon: '➖', category: 'action',
    description: "Retire un rôle de l'auteur",
    configFields: [
      { key: 'role', label: 'Nom du rôle', type: 'text', placeholder: 'VIP' },
    ]
  },
  action_kick: {
    label: 'Kick membre', icon: '👢', category: 'action',
    description: 'Expulse le membre du serveur',
    configFields: [
      { key: 'reason', label: 'Raison (optionnel)', type: 'text', placeholder: 'Violation des règles' },
    ]
  },
  action_ban: {
    label: 'Ban membre', icon: '🔨', category: 'action',
    description: 'Bannit le membre du serveur',
    configFields: [
      { key: 'reason', label: 'Raison (optionnel)', type: 'text', placeholder: 'Violation des règles' },
    ]
  },
  action_delete_message: {
    label: 'Supprimer message', icon: '🗑️', category: 'action',
    description: 'Supprime le message déclencheur',
    configFields: []
  },
  action_pin_message: {
    label: 'Épingler message', icon: '📌', category: 'action',
    description: 'Épingle le message déclencheur',
    configFields: []
  },
  action_add_reaction: {
    label: 'Ajouter réaction', icon: '😍', category: 'action',
    description: 'Ajoute une réaction au message',
    configFields: [
      { key: 'emoji', label: 'Emoji', type: 'text', placeholder: '👍' },
    ]
  },
  action_wait: {
    label: 'Attendre', icon: '⏳', category: 'action',
    description: 'Attend X secondes avant de continuer',
    configFields: [
      { key: 'seconds', label: 'Durée (secondes)', type: 'number', default: 5 },
    ]
  },

  // ── VARIABLES ─────────────────────────────────────────────────
  variable_set: {
    label: 'Définir variable', icon: '📝', category: 'variable',
    description: 'Définit la valeur d\'une variable',
    configFields: [
      { key: 'name', label: 'Nom', type: 'text', placeholder: 'compteur' },
      { key: 'value', label: 'Valeur', type: 'text', placeholder: '0' },
    ]
  },
  variable_increment: {
    label: 'Incrémenter', icon: '↑', category: 'variable',
    description: 'Incrémente un compteur de 1',
    configFields: [
      { key: 'name', label: 'Nom du compteur', type: 'text', placeholder: 'compteur' },
    ]
  },
  variable_decrement: {
    label: 'Décrémenter', icon: '↓', category: 'variable',
    description: 'Décrémente un compteur de 1',
    configFields: [
      { key: 'name', label: 'Nom du compteur', type: 'text', placeholder: 'compteur' },
    ]
  },
  variable_get: {
    label: 'Lire variable', icon: '📖', category: 'variable',
    description: 'Lit la valeur d\'une variable',
    configFields: [
      { key: 'name', label: 'Nom', type: 'text', placeholder: 'compteur' },
    ]
  },
  variable_list_add: {
    label: 'Ajouter à liste', icon: '📋+', category: 'variable',
    description: 'Ajoute un élément à une liste',
    configFields: [
      { key: 'list', label: 'Nom de la liste', type: 'text', placeholder: 'maListe' },
      { key: 'value', label: 'Valeur', type: 'text', placeholder: '{username}' },
    ]
  },
  variable_list_remove: {
    label: 'Retirer de liste', icon: '📋-', category: 'variable',
    description: 'Retire un élément d\'une liste',
    configFields: [
      { key: 'list', label: 'Nom de la liste', type: 'text', placeholder: 'maListe' },
      { key: 'value', label: 'Valeur', type: 'text', placeholder: '{username}' },
    ]
  },
  variable_list_contains: {
    label: 'Liste contient?', icon: '🔎', category: 'variable',
    description: 'Vérifie si une liste contient une valeur',
    configFields: [
      { key: 'list', label: 'Nom de la liste', type: 'text', placeholder: 'maListe' },
      { key: 'value', label: 'Valeur cherchée', type: 'text', placeholder: '{username}' },
    ]
  },

  // ── UTILITAIRES ───────────────────────────────────────────────
  util_log: {
    label: 'Log', icon: '📜', category: 'utility',
    description: 'Écrit dans les logs du bot',
    configFields: [
      { key: 'message', label: 'Message', type: 'text', placeholder: 'Événement: {username}' },
    ]
  },
  util_random: {
    label: 'Aléatoire', icon: '🎲', category: 'utility',
    description: 'Choisit aléatoirement parmi une liste',
    configFields: [
      { key: 'options', label: 'Options (séparées par ,)', type: 'textarea', placeholder: 'Bonjour,Salut,Hello' },
      { key: 'varName', label: 'Stocker dans variable', type: 'text', placeholder: 'choix' },
    ]
  },
  util_format: {
    label: 'Formater texte', icon: '✍️', category: 'utility',
    description: 'Formate un texte avec des variables',
    configFields: [
      { key: 'template', label: 'Template', type: 'textarea', placeholder: 'Bonjour {username}, tu es le membre n°{compteur}' },
      { key: 'varName', label: 'Stocker dans variable', type: 'text', placeholder: 'resultat' },
    ]
  },
  util_math: {
    label: 'Opération math', icon: '🔢', category: 'utility',
    description: 'Effectue une opération mathématique',
    configFields: [
      { key: 'varA', label: 'Variable A', type: 'text', placeholder: 'compteur' },
      { key: 'operator', label: 'Opération', type: 'select', options: ['+', '-', '*', '/'], default: '+' },
      { key: 'valueB', label: 'Valeur B', type: 'text', placeholder: '1' },
      { key: 'result', label: 'Stocker résultat dans', type: 'text', placeholder: 'resultat' },
    ]
  },
}

export const CATEGORY_META: Record<NodeCategory, { label: string; color: string }> = {
  trigger:   { label: 'Déclencheurs', color: '#5865f2' },
  condition: { label: 'Conditions',   color: '#f0b232' },
  action:    { label: 'Actions',      color: '#f23f43' },
  variable:  { label: 'Variables',    color: '#23a559' },
  utility:   { label: 'Utilitaires',  color: '#9b59b6' },
}
