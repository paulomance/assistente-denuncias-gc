interface DemoSummaryProps {
  fileName: string
  fileSizeBytes: number
  localPath: string
  onContinue: () => void
  onReset: () => void
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(1)} MB`
}

export function DemoSummary({
  fileName,
  fileSizeBytes,
  localPath,
  onContinue,
  onReset
}: DemoSummaryProps): React.JSX.Element {
  return (
    <div className="demo-summary">
      <p className="demo-summary__title">Demo selecionada</p>
      <p className="demo-summary__filename">{fileName}</p>

      <dl className="demo-summary__details">
        <dt>Tamanho</dt>
        <dd>{formatBytes(fileSizeBytes)}</dd>
        <dt>Local</dt>
        <dd className="demo-summary__path" title={localPath}>
          {localPath}
        </dd>
        <dt>Status</dt>
        <dd>Demo válida</dd>
      </dl>

      <div className="demo-summary__actions">
        <button type="button" className="btn btn--primary" onClick={onContinue}>
          Continuar com esta demo
        </button>
        <button type="button" className="btn btn--secondary" onClick={onReset}>
          Escolher outra demo
        </button>
      </div>
    </div>
  )
}
