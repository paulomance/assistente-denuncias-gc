import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './Icon'
import { ChatViewerModal } from './ChatViewerModal'
import { AudioPlayerModal } from './AudioPlayerModal'
import { DEFAULT_VOLUME_PERCENT, effectiveVolumePercent, percentToVolume } from '../utils/audioVolume'
import {
  countIncluded,
  getChoice,
  includesAudio,
  includesChat,
  isIncluded,
  setChoice,
  withAudioIncluded,
  withChatIncluded,
  type PlayerEvidenceChoiceMap
} from '../utils/playerEvidenceSelection'
import type { ExtractedVoice } from '../../../shared/types/Csgove'

interface PlayerSelectionListProps {
  players: ExtractedVoice[]
  onConfirm: (selectedPlayers: ExtractedVoice[]) => void
  onReset: () => void
}

type Side = 'CT' | 'T'

interface TeamGroup {
  side: Side
  teamName: string | null
  players: ExtractedVoice[]
}

// "TR" em vez de "T" na UI para nao confundir com abreviacoes de "Time"
// (preferencia explicita do usuario).
const SIDE_LABEL: Record<Side, string> = { CT: 'CT', T: 'TR' }
const SIDE_ORDER: Side[] = ['CT', 'T']

/**
 * So separa visualmente por equipe quando TODOS os jogadores da lista tem
 * lado conhecido (side nao-nulo) — dado real lido da propria demo, nunca
 * inferido pelo nome (ver matchTeams.ts). Qualquer situacao ambigua
 * (dado ausente/parcial) volta para a lista simples de sempre: preferimos
 * uma UI que sempre funciona a uma separacao por time parcialmente
 * quebrada.
 */
function groupByTeam(players: ExtractedVoice[]): TeamGroup[] | null {
  if (players.length === 0) return null
  if (!players.every((player) => player.side === 'CT' || player.side === 'T')) return null

  const bySide = new Map<Side, ExtractedVoice[]>()
  for (const player of players) {
    const side = player.side as Side
    const existing = bySide.get(side)
    if (existing) {
      existing.push(player)
    } else {
      bySide.set(side, [player])
    }
  }
  if (bySide.size !== 2) return null

  return SIDE_ORDER.filter((side) => bySide.has(side)).map((side) => {
    const sidePlayers = bySide.get(side) as ExtractedVoice[]
    const teamNames = new Set(
      sidePlayers.map((player) => player.teamName).filter((name): name is string => Boolean(name))
    )
    return { side, teamName: teamNames.size === 1 ? [...teamNames][0] : null, players: sidePlayers }
  })
}

/**
 * URL oficial e sempre valida do perfil Steam a partir do SteamID64 (ja
 * disponivel no fluxo, extraido da propria demo) — nao depende de
 * nenhuma chave de API, e o mesmo padrao que qualquer site/app usa pra
 * linkar um perfil Steam por ID. Perfil da Gamers Club NAO e oferecido
 * aqui: o Match ID identifica a partida, nao o jogador, e nao ha uma API
 * publica/documentada da GC pra resolver "SteamID64 -> perfil GC" sem
 * inventar uma URL que pode nao existir — limitacao investigada e
 * documentada em docs/plano-frente-b.md, nao um esquecimento.
 */
function steamProfileUrl(steamId64: string): string {
  return `https://steamcommunity.com/profiles/${steamId64}`
}

type AudioLoadState = 'idle' | 'loading' | 'error'

// Padrao pedido explicitamente pelo usuario: varios audios extraidos de
// demo chegam altos demais pra ouvir confortavelmente antes de decidir
// quem denunciar — 50% costuma ser um ponto de partida confortavel sem
// exigir que o jogador mexa no controle toda vez. `DEFAULT_VOLUME_PERCENT`
// (audioVolume.ts) e a UNICA fonte da verdade pro numero — aqui so
// converte pro formato 0-1 que o estado React/elemento <audio> usam.
const DEFAULT_VOLUME = percentToVolume(DEFAULT_VOLUME_PERCENT)

/**
 * "Quem você quer denunciar?" — cada jogador mostra só os ÍCONES das
 * evidências que ele REALMENTE TEM (🎙 áudio, 💬 texto — nunca um ícone
 * desabilitado pra uma evidência inexistente, ver `hasAudio`/`hasChat`
 * abaixo). Clicar num ícone NUNCA inclui nada — só abre um modal
 * (AudioPlayerModal.tsx / ChatViewerModal.tsx) onde o jogador ouve/lê e
 * SÓ ENTÃO decide incluir, via um checkbox explícito dentro do modal.
 * Essa separação (ícone = explorar, checkbox no modal = incluir) é o
 * que garante, por construção, que abrir nunca inclui: são dois
 * `useState` diferentes, acionados por dois elementos de UI diferentes,
 * sem nenhum caminho de código que faça as duas coisas no mesmo clique.
 *
 * O ícone em si vira o indicador de "incluído" (preenchido com a cor
 * de destaque quando a evidência está marcada, contorno neutro quando
 * só está disponível) — dá pra ler o resumo de cada jogador na lista
 * inteira sem abrir nenhum modal.
 *
 * Histórico: 4ª rodada da tela de seleção. As 3 anteriores tentaram
 * (1) dois `Set` independentes, (2) `{includeAudio, includeChat}` com
 * checkbox principal, (3) um `<select>` dropdown, (4) dois toggles
 * sempre visíveis no card (🎙/💬 clicáveis direto, + play + "Ver"
 * separados — até 4 controles por jogador). O modelo de dados
 * (`EvidenceChoice`, ver playerEvidenceSelection.ts) não mudou desde a
 * 2ª tentativa — só a INTERAÇÃO mudou a cada rodada, sempre em resposta
 * a feedback real de uso.
 */
export function PlayerSelectionList({
  players,
  onConfirm,
  onReset
}: PlayerSelectionListProps): React.JSX.Element {
  const [evidenceByPlayer, setEvidenceByPlayer] = useState<PlayerEvidenceChoiceMap>({})
  const teamGroups = useMemo(() => groupByTeam(players), [players])

  const [chatViewerPlayerId, setChatViewerPlayerId] = useState<string | null>(null)
  const [audioPlayerPlayerId, setAudioPlayerPlayerId] = useState<string | null>(null)

  const audioRef = useRef<HTMLAudioElement>(null)
  const blobUrlsRef = useRef<Map<string, string>>(new Map())
  const [playingId, setPlayingId] = useState<string | null>(null)
  // Quem tem o `<audio>` compartilhado carregado AGORA (toca ou está
  // pausado no meio) — diferente de `playingId` (só quem está tocando
  // ATIVAMENTE). Sem isso, reabrir o modal de um jogador PAUSADO
  // mostraria a posição zerada em vez da posição real onde ele parou;
  // e abrir o modal de um jogador que nunca tocou mostraria a
  // duração/posição residual do último jogador que tocou.
  const [loadedPlayerId, setLoadedPlayerId] = useState<string | null>(null)
  const [loadStates, setLoadStates] = useState<Record<string, AudioLoadState>>({})
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  // Volume da SESSAO (nao persistido em disco entre aberturas do app —
  // "preservar durante aquela sessao" foi o que o usuario pediu, nada
  // mais). Um unico valor pra todos os jogadores: o controle atua sobre
  // o elemento <audio> compartilhado, nunca sobre o arquivo .wav em si.
  const [volume, setVolume] = useState(DEFAULT_VOLUME)
  const [isMuted, setIsMuted] = useState(false)

  useEffect(() => {
    // Revoga todas as Blob URLs criadas ao desmontar a tela — evita
    // vazar memoria se o usuario ouvir varios audios antes de continuar.
    const urls = blobUrlsRef.current
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume
    }
  }, [volume, isMuted])

  // Atalho "Incluir áudio na denúncia" dentro do AudioPlayerModal —
  // mexe SÓ no componente de áudio da escolha, preservando o texto (ver
  // withAudioIncluded). Nunca é chamado por abrir o modal/tocar o
  // áudio, só pelo checkbox explícito.
  const handleModalToggleAudio = useCallback((steamId64: string, include: boolean): void => {
    setEvidenceByPlayer((previous) => setChoice(previous, steamId64, withAudioIncluded(getChoice(previous, steamId64), include)))
  }, [])

  // Atalho "Incluir este texto na denúncia" dentro do ChatViewerModal —
  // mexe SÓ no componente de texto, preservando o áudio (ver
  // withChatIncluded).
  const handleModalToggleChat = useCallback((steamId64: string, include: boolean): void => {
    setEvidenceByPlayer((previous) => setChoice(previous, steamId64, withChatIncluded(getChoice(previous, steamId64), include)))
  }, [])

  const handleTogglePlay = useCallback(
    async (player: ExtractedVoice) => {
      if (!player.audioPath) return
      const audioPath = player.audioPath

      const audio = audioRef.current
      if (!audio) return

      if (playingId === player.steamId64) {
        audio.pause()
        setPlayingId(null)
        return
      }

      let url = blobUrlsRef.current.get(player.steamId64)
      if (!url) {
        setLoadStates((prev) => ({ ...prev, [player.steamId64]: 'loading' }))
        const result = await window.gcReport.readAudioFile(audioPath)
        if (result.status !== 'success') {
          setLoadStates((prev) => ({ ...prev, [player.steamId64]: 'error' }))
          return
        }
        const blob = new Blob([result.data], { type: 'audio/wav' })
        url = URL.createObjectURL(blob)
        blobUrlsRef.current.set(player.steamId64, url)
        setLoadStates((prev) => ({ ...prev, [player.steamId64]: 'idle' }))
      }

      audio.src = url
      setCurrentTime(0)
      setDuration(0)
      setLoadedPlayerId(player.steamId64)
      try {
        await audio.play()
        setPlayingId(player.steamId64)
      } catch {
        setLoadStates((prev) => ({ ...prev, [player.steamId64]: 'error' }))
      }
    },
    [playingId]
  )

  const handleSeek = useCallback(
    (fraction: number) => {
      const audio = audioRef.current
      if (audio && duration > 0) {
        audio.currentTime = fraction * duration
      }
    },
    [duration]
  )

  const handleVolumeChange = useCallback((nextPercent: number) => {
    const next = percentToVolume(nextPercent)
    setVolume(next)
    setIsMuted(next === 0)
  }, [])

  const toggleMute = useCallback(() => {
    setIsMuted((previous) => !previous)
  }, [])

  // Fechar o player (Concluído/Esc/clique fora) pausa a reprodução —
  // nunca deixa o áudio tocando "invisível" sem nenhum player visível
  // pra pausar.
  const handleCloseAudioModal = useCallback(() => {
    if (playingId && audioRef.current) {
      audioRef.current.pause()
      setPlayingId(null)
    }
    setAudioPlayerPlayerId(null)
  }, [playingId])

  const includedCount = countIncluded(evidenceByPlayer)
  const currentVolumePercent = effectiveVolumePercent(volume, isMuted)

  const renderPlayer = (player: ExtractedVoice): React.JSX.Element => {
    const choice = getChoice(evidenceByPlayer, player.steamId64)
    const included = isIncluded(choice)
    const hasAudio = Boolean(player.audioPath)
    const hasChat = Boolean(player.chatMessages && player.chatMessages.length > 0)
    const avatarSideClass =
      player.side === 'CT' ? ' player-card__avatar--ct' : player.side === 'T' ? ' player-card__avatar--t' : ''

    return (
      <li key={player.steamId64} className={`player-card${included ? ' player-card--selected' : ''}`}>
        <div className="player-card__label">
          <span className={`player-card__avatar${avatarSideClass}`} aria-hidden="true">
            <Icon name="player" size={18} />
          </span>
          <span className="player-card__info">
            <span className="player-card__name">{player.rawPlayerName.trim()}</span>
            <a
              href={steamProfileUrl(player.steamId64)}
              target="_blank"
              rel="noreferrer"
              className="player-card__steam-link"
            >
              <Icon name="external" size={11} /> Perfil Steam
            </a>
          </span>
          {/*
            Só os ícones das evidências que o jogador REALMENTE TEM —
            nunca um ícone apagado/desabilitado pra algo que não existe
            (pedido explícito do usuário). Clicar SEMPRE abre o modal
            correspondente pra explorar (ouvir/ler); NUNCA inclui nada
            por conta própria — a inclusão só acontece pelo checkbox
            dentro de cada modal. O preenchimento do ícone (classe
            `--included`) é só um INDICADOR do que já foi incluído,
            nunca o próprio controle de inclusão.
          */}
          {hasAudio && (
            <button
              type="button"
              className={`player-card__evidence-icon${includesAudio(choice) ? ' player-card__evidence-icon--included' : ''}`}
              onClick={() => setAudioPlayerPlayerId(player.steamId64)}
              title={
                includesAudio(choice)
                  ? 'Áudio incluído na denúncia — clique para ouvir ou remover'
                  : 'Ouvir o áudio deste jogador e decidir se inclui na denúncia'
              }
              aria-label={`Áudio de ${player.rawPlayerName.trim()}${includesAudio(choice) ? ' — incluído na denúncia' : ''}`}
            >
              <Icon name="mic" size={15} />
            </button>
          )}
          {hasChat && (
            <button
              type="button"
              className={`player-card__evidence-icon${includesChat(choice) ? ' player-card__evidence-icon--included' : ''}`}
              onClick={() => setChatViewerPlayerId(player.steamId64)}
              title={
                includesChat(choice)
                  ? 'Texto incluído na denúncia — clique para ler ou remover'
                  : 'Ler o texto deste jogador e decidir se inclui na denúncia'
              }
              aria-label={`Texto de ${player.rawPlayerName.trim()}${includesChat(choice) ? ' — incluído na denúncia' : ''}`}
            >
              <Icon name="chat" size={15} />
            </button>
          )}
        </div>
      </li>
    )
  }

  return (
    <div className={teamGroups ? 'player-list player-list--teams' : 'player-list'}>
      <p className="player-list__title">Quem você quer denunciar?</p>
      <p className="player-list__subtitle">
        Selecione os jogadores e marque as evidências que deseja incluir na denúncia. Nada é incluído
        automaticamente.
      </p>
      <p className="player-list__count">
        {players.length} jogador{players.length === 1 ? '' : 'es'} com evidências disponíveis
      </p>

      {teamGroups ? (
        <div className="player-list__teams">
          {teamGroups.map((group) => (
            <div
              key={group.side}
              className={`player-list__team player-list__team--${group.side === 'CT' ? 'ct' : 't'}`}
            >
              <p className="player-list__team-name">
                <span className={`player-list__team-badge player-list__team-badge--${group.side === 'CT' ? 'ct' : 't'}`}>
                  {SIDE_LABEL[group.side]}
                </span>
                {group.teamName ?? `Time ${group.side === 'CT' ? '1' : '2'}`}
              </p>
              <ul className="player-list__items">{group.players.map(renderPlayer)}</ul>
            </div>
          ))}
        </div>
      ) : (
        <ul className="player-list__items player-list__items--single">{players.map(renderPlayer)}</ul>
      )}

      <div className="demo-summary__actions">
        <button
          type="button"
          className="btn btn--primary"
          disabled={includedCount === 0}
          onClick={() =>
            onConfirm(
              players
                .filter((player) => isIncluded(getChoice(evidenceByPlayer, player.steamId64)))
                .map((player) => {
                  const choice = getChoice(evidenceByPlayer, player.steamId64)
                  return {
                    ...player,
                    includeAudioInReport: includesAudio(choice),
                    includeChatInReport: includesChat(choice)
                  }
                })
            )
          }
        >
          {includedCount === 0
            ? 'Selecione ao menos uma evidência'
            : `Continuar com ${includedCount} jogador${includedCount === 1 ? '' : 'es'} selecionado${
                includedCount === 1 ? '' : 's'
              }`}
        </button>
        <button type="button" className="btn btn--secondary" onClick={onReset}>
          Escolher outra demo
        </button>
      </div>

      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- audio de voz, nunca tem legenda disponivel */}
      <audio
        ref={audioRef}
        onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
        onLoadedMetadata={() => audioRef.current && setDuration(audioRef.current.duration)}
        onEnded={() => {
          setPlayingId(null)
          setCurrentTime(0)
        }}
        style={{ display: 'none' }}
      />

      {audioPlayerPlayerId &&
        (() => {
          const player = players.find((p) => p.steamId64 === audioPlayerPlayerId)
          if (!player || !player.audioPath) return null
          const choice = getChoice(evidenceByPlayer, player.steamId64)
          return (
            <AudioPlayerModal
              playerName={player.rawPlayerName.trim()}
              isPlaying={playingId === player.steamId64}
              loadState={loadStates[player.steamId64] ?? 'idle'}
              currentTime={loadedPlayerId === player.steamId64 ? currentTime : 0}
              duration={loadedPlayerId === player.steamId64 ? duration : 0}
              volumePercent={currentVolumePercent}
              isMuted={isMuted}
              includeInReport={includesAudio(choice)}
              onTogglePlay={() => void handleTogglePlay(player)}
              onSeek={handleSeek}
              onVolumeChange={handleVolumeChange}
              onToggleMute={toggleMute}
              onToggleInclude={(include) => handleModalToggleAudio(player.steamId64, include)}
              onClose={handleCloseAudioModal}
            />
          )
        })()}

      {chatViewerPlayerId &&
        (() => {
          const player = players.find((p) => p.steamId64 === chatViewerPlayerId)
          if (!player || !player.chatMessages || player.chatMessages.length === 0) return null
          return (
            <ChatViewerModal
              playerName={player.rawPlayerName.trim()}
              messages={player.chatMessages}
              includeInReport={includesChat(getChoice(evidenceByPlayer, player.steamId64))}
              onToggleInclude={(include) => handleModalToggleChat(player.steamId64, include)}
              onClose={() => setChatViewerPlayerId(null)}
            />
          )
        })()}
    </div>
  )
}
