export type TunnelState = 'off' | 'list' | 'full'
export type ProfileType = 'awg' | 'wg'
export type Connection = 'online' | 'offline' | 'busy'

export interface Status {
  state: TunnelState
  profile: string
  type: ProfileType | ''
  iface: string
  up: boolean
  hsAge: number
  healthy: boolean
  dnsFallback: boolean
  endpoint: string
  version: string
}

export interface Preset {
  id: string
  title: string
  enabled: boolean
  updated: number
  domains: number
  subnets: number
  sample: string[]
}

export interface DiagResult {
  checks: { id: string; ok: boolean; detail: string }[]
  verdict: 'ok' | 'router' | 'provider' | 'server' | 'profile'
  message: string
}

export type ImportErrorCode = 'not_vpn' | 'admin_profile' | 'no_config' | 'bad_config'

export interface ImportedProfile {
  name: string
  type: ProfileType
  config: string
}
