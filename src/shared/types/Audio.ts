/**
 * `data` e um `ArrayBuffer` (cruza IPC via structured clone) contendo
 * os bytes reais do .wav — nunca uma URL de filesystem exposta
 * diretamente ao renderer (o CSP do app bloqueia `file://` por padrao,
 * de proposito). `status: 'error'` cobre tanto "arquivo nao existe
 * mais" quanto "caminho rejeitado por seguranca" — o renderer nao
 * precisa distinguir os dois, so mostrar que o audio nao esta
 * disponivel.
 */
export type ReadAudioFileResult = { status: 'success'; data: ArrayBuffer } | { status: 'error' }
