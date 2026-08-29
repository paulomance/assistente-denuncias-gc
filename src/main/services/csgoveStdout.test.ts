import { describe, expect, it } from 'vitest'
import { hasStartedGeneratingAudioFiles } from './csgoveStdout'

describe('hasStartedGeneratingAudioFiles', () => {
  it('retorna false so com a primeira linha real do CSGOVE', () => {
    const stdout = 'Processing demo C:\\demo.dem\n'
    expect(hasStartedGeneratingAudioFiles(stdout)).toBe(false)
  })

  it('retorna true depois da linha real de transicao do CSGOVE', () => {
    const stdout = 'Processing demo C:\\demo.dem\nParsing done, generating audio files...\n'
    expect(hasStartedGeneratingAudioFiles(stdout)).toBe(true)
  })

  it('retorna false para stdout vazio', () => {
    expect(hasStartedGeneratingAudioFiles('')).toBe(false)
  })
})
