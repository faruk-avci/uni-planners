import { useCallback, useEffect, useRef, useState } from 'react'
import { courseService } from '../../services/courseService'
import './DinoGame.css'

const WIDTH = 900
const HEIGHT = 280
const GROUND = 226
const DINO = { x: 64, width: 66, height: 82 }
const OZU_EMAIL_RE = /^[a-z0-9._%+-]+@ozu\.edu\.tr$/i
const highScoreKey = email => `uniplanner_dino_high_score:${email}`
const OBSTACLE_TYPES = [
  { name: 'Bütler', width: 34, height: 48, shape: 'horns' },
  { name: 'Zamlar', width: 38, height: 42, shape: 'teeth' },
  { name: 'Midtermler', width: 46, height: 52, shape: 'heads' },
  { name: 'Akkol', width: 52, height: 38, shape: 'arms' },
  { name: 'Finaller', width: 42, height: 62, shape: 'boss' },
]

function paletteColors() {
  const styles = getComputedStyle(document.documentElement)
  return {
    background: styles.getPropertyValue('--bg-secondary').trim() || '#ffffff',
    ink: styles.getPropertyValue('--text-primary').trim() || '#18181b',
    muted: styles.getPropertyValue('--text-tertiary').trim() || '#a1a1aa',
    accent: styles.getPropertyValue('--accent-primary').trim() || '#18181b',
  }
}

function DinoGame({ active, open, onOpen, onClose, language }) {
  const canvasRef = useRef(null)
  const playerImageRef = useRef(null)
  const frameRef = useRef(null)
  const lastTimeRef = useRef(0)
  const gameRef = useRef(null)
  const savedEmail = localStorage.getItem('uniplanner_dino_email') || ''
  const [expanded, setExpanded] = useState(false)
  const [running, setRunning] = useState(false)
  const [gameOver, setGameOver] = useState(false)
  const [score, setScore] = useState(0)
  const [highScore, setHighScore] = useState(() => {
    if (!OZU_EMAIL_RE.test(savedEmail)) return 0
    const key = highScoreKey(savedEmail.toLowerCase())
    const stored = localStorage.getItem(key)
    if (stored !== null) return Number(stored) || 0
    const legacy = Number(localStorage.getItem('uniplanner_dino_high_score')) || 0
    localStorage.setItem(key, String(legacy))
    return legacy
  })
  const [email, setEmail] = useState(() => OZU_EMAIL_RE.test(savedEmail) ? savedEmail.toLowerCase() : '')
  const [emailInput, setEmailInput] = useState(savedEmail)
  const [emailError, setEmailError] = useState('')
  const [leaderboard, setLeaderboard] = useState([])
  const [leaderboardLoading, setLeaderboardLoading] = useState(false)
  const [scoreSaving, setScoreSaving] = useState(false)
  const tr = (trText, enText) => language === 'tr' ? trText : enText

  useEffect(() => {
    const image = new Image()
    image.src = '/assets/dino/dino-player-game.png'
    playerImageRef.current = image
    return () => { playerImageRef.current = null }
  }, [])

  const refreshLeaderboard = useCallback(async () => {
    setLeaderboardLoading(true)
    try {
      const data = await courseService.getDinoLeaderboard(100)
      setLeaderboard(data.players || [])
    } catch {
      setLeaderboard([])
    } finally {
      setLeaderboardLoading(false)
    }
  }, [])

  useEffect(() => {
    if (active) refreshLeaderboard()
  }, [active, refreshLeaderboard])

  const saveScore = useCallback(async (nextScore, playerEmail = email) => {
    if (!playerEmail || nextScore < 0) return
    setScoreSaving(true)
    try {
      const result = await courseService.submitDinoScore(playerEmail, nextScore)
      const savedBest = Number(result.bestScore) || 0
      localStorage.setItem(highScoreKey(playerEmail), String(savedBest))
      setHighScore(savedBest)
      await refreshLeaderboard()
    } catch {
      // Keep the local high score if the server is temporarily unavailable.
    } finally {
      setScoreSaving(false)
    }
  }, [email, refreshLeaderboard])

  const handleEmailSubmit = async event => {
    event.preventDefault()
    const normalized = emailInput.trim().toLowerCase()
    if (!OZU_EMAIL_RE.test(normalized)) {
      setEmailError(tr('Geçerli bir @ozu.edu.tr adresi girin.', 'Enter a valid @ozu.edu.tr address.'))
      return
    }
    setEmailError('')
    setEmail(normalized)
    setEmailInput(normalized)
    localStorage.setItem('uniplanner_dino_email', normalized)
    const playerBest = Number(localStorage.getItem(highScoreKey(normalized))) || 0
    setHighScore(playerBest)
    await saveScore(playerBest, normalized)
  }

  const resetGame = useCallback(() => {
    gameRef.current = {
      y: GROUND - DINO.height,
      velocity: 0,
      obstacles: [],
      clouds: [230, 510, 790],
      spawnIn: 1.1,
      distance: 0,
      speed: 340,
      running: true,
    }
    setScore(0)
    setGameOver(false)
    setRunning(true)
  }, [])

  const jump = useCallback(() => {
    if (!open || !email) return
    if (!gameRef.current?.running) resetGame()
    const game = gameRef.current
    if (game && game.y >= GROUND - DINO.height - 1) game.velocity = -735
  }, [email, open, resetGame])

  useEffect(() => {
    if (!open || !email) return undefined
    const onKeyDown = event => {
      if (event.code === 'Space' || event.code === 'ArrowUp') {
        event.preventDefault()
        jump()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [email, jump, open])

  useEffect(() => {
    if (!open) {
      window.cancelAnimationFrame(frameRef.current)
      lastTimeRef.current = 0
      return undefined
    }

    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return undefined

    const drawDino = (x, y, colors, step) => {
      const playerImage = playerImageRef.current
      if (playerImage?.complete && playerImage.naturalWidth > 0) {
        context.drawImage(playerImage, x, y + (step ? 1 : 0), DINO.width, DINO.height)
        return
      }

      context.fillStyle = colors.ink
      context.fillRect(x + 7, y + 13, 27, 29)
      context.fillRect(x + 23, y + 2, 19, 22)
      context.fillRect(x + 38, y + 7, 8, 9)
      context.fillRect(x, y + 27, 13, 8)
      context.clearRect(x + 34, y + 6, 4, 4)
      context.fillRect(x + 12, y + 40, 7, step ? 10 : 7)
      context.fillRect(x + 27, y + 40, 7, step ? 7 : 10)
    }

    const drawObstacle = (obstacle, colors) => {
      context.fillStyle = colors.accent
      const top = GROUND - obstacle.height
      const x = obstacle.x
      const w = obstacle.width

      // Deliberately lopsided mutant bodies: each exam-monster has its own
      // awkward silhouette but keeps a simple rectangular collision box.
      context.fillRect(x + 6, top + 9, w - 12, obstacle.height - 9)
      context.fillRect(x + 1, top + 17, 9, obstacle.height - 24)
      context.fillRect(x + w - 10, top + 12, 9, obstacle.height - 20)
      context.fillRect(x + 10, top + 4, w - 21, 9)

      if (obstacle.shape === 'horns' || obstacle.shape === 'boss') {
        context.fillRect(x + 5, top, 7, 12)
        context.fillRect(x + w - 13, top - 4, 7, 16)
      }
      if (obstacle.shape === 'heads') {
        context.fillRect(x, top + 2, 17, 18)
        context.fillRect(x + w - 17, top - 3, 17, 21)
      }
      if (obstacle.shape === 'arms') {
        context.fillRect(x - 11, top + 17, 19, 7)
        context.fillRect(x + w - 5, top + 9, 20, 7)
        context.fillRect(x - 11, top + 17, 6, 17)
      }
      if (obstacle.shape === 'teeth') {
        context.fillRect(x - 5, top + 8, 10, 8)
        context.fillRect(x + w - 5, top + 21, 10, 8)
      }

      // Uneven eyes and square teeth make the obstacles properly "ucube".
      context.fillStyle = colors.background
      context.fillRect(x + 11, top + 14, 5, 6)
      context.fillRect(x + w - 17, top + 11, 4, 8)
      context.fillRect(x + 13, top + 27, 5, 5)
      context.fillRect(x + 21, top + 27, 4, 8)

      context.fillStyle = colors.ink
      context.font = 'bold 12px monospace'
      context.textAlign = 'center'
      context.fillText(obstacle.name, x + w / 2, top - 10)
      context.textAlign = 'start'
    }

    const render = timestamp => {
      const delta = Math.min((timestamp - (lastTimeRef.current || timestamp)) / 1000, 0.035)
      lastTimeRef.current = timestamp
      const game = gameRef.current
      const colors = paletteColors()

      context.clearRect(0, 0, WIDTH, HEIGHT)
      context.fillStyle = colors.background
      context.fillRect(0, 0, WIDTH, HEIGHT)

      if (game?.running) {
        game.distance += game.speed * delta
        game.speed = Math.min(620, 340 + game.distance / 35)
        game.velocity += 1900 * delta
        game.y = Math.min(GROUND - DINO.height, game.y + game.velocity * delta)
        if (game.y >= GROUND - DINO.height) game.velocity = 0

        game.spawnIn -= delta
        if (game.spawnIn <= 0) {
          const type = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)]
          game.obstacles.push({ x: WIDTH + 30, ...type })
          game.spawnIn = 0.88 + Math.random() * 0.78 - Math.min(0.25, game.distance / 18000)
        }

        game.obstacles.forEach(obstacle => { obstacle.x -= game.speed * delta })
        game.obstacles = game.obstacles.filter(obstacle => obstacle.x > -60)
        game.clouds = game.clouds.map(x => x - game.speed * delta * 0.08).map(x => x < -90 ? WIDTH + Math.random() * 220 : x)

        const dinoBox = { left: DINO.x + 7, right: DINO.x + DINO.width - 2, bottom: game.y + DINO.height - 2 }
        const collided = game.obstacles.some(obstacle => (
          dinoBox.right > obstacle.x + 3 &&
          dinoBox.left < obstacle.x + obstacle.width - 3 &&
          dinoBox.bottom > GROUND - obstacle.height + 3
        ))

        const nextScore = Math.floor(game.distance / 12)
        setScore(current => current === nextScore ? current : nextScore)
        if (collided) {
          game.running = false
          setRunning(false)
          setGameOver(true)
          setHighScore(current => {
            const nextHigh = Math.max(current, nextScore)
            localStorage.setItem(highScoreKey(email), String(nextHigh))
            return nextHigh
          })
          saveScore(nextScore)
        }
      }

      context.strokeStyle = colors.muted
      context.lineWidth = 2
      context.beginPath()
      context.moveTo(0, GROUND + 1)
      context.lineTo(WIDTH, GROUND + 1)
      context.stroke()

      const shownGame = game || { y: GROUND - DINO.height, obstacles: [], clouds: [230, 510, 790], distance: 0 }
      context.fillStyle = colors.muted
      shownGame.clouds.forEach((x, index) => {
        const y = 48 + index * 24
        context.fillRect(x, y, 38, 3)
        context.fillRect(x + 10, y - 7, 20, 7)
      })
      shownGame.obstacles.forEach(obstacle => drawObstacle(obstacle, colors))
      drawDino(DINO.x, shownGame.y, colors, Math.floor(shownGame.distance / 28) % 2)

      frameRef.current = window.requestAnimationFrame(render)
    }

    frameRef.current = window.requestAnimationFrame(render)
    return () => {
      window.cancelAnimationFrame(frameRef.current)
      lastTimeRef.current = 0
    }
  }, [open, saveScore])

  useEffect(() => {
    if (!active) {
      setExpanded(false)
      setRunning(false)
      setGameOver(false)
      gameRef.current = null
    }
  }, [active])

  if (!active) return null

  if (!open) {
    return (
      <section className="dino-collapsed-bar">
        <div><span>DINO MODE</span><strong>UniPlanners Run</strong></div>
        <button type="button" onClick={onOpen}>{tr('Oyunu aç', 'Open game')}</button>
      </section>
    )
  }

  return (
    <section className={`dino-game-section ${expanded ? 'dino-section-expanded' : ''}`} aria-labelledby="dino-game-title">
      <header className="dino-game-header">
        <div>
          <span className="dino-game-kicker">DINO MODE</span>
          <strong id="dino-game-title">UniPlanners Run</strong>
        </div>
        <div className="dino-game-window-actions">
          <button type="button" onClick={() => setExpanded(value => !value)} aria-label={expanded ? tr('Daralt', 'Contract') : tr('Genişlet', 'Extend')} title={expanded ? tr('Daralt', 'Contract') : tr('Genişlet', 'Extend')}>
            {expanded ? '↙' : '↗'}
          </button>
          <button type="button" onClick={() => { setExpanded(false); onClose() }} aria-label={tr('Oyunu kapat', 'Close game')} title={tr('Kapat', 'Close')}>×</button>
        </div>
      </header>

      <div className="dino-content-grid">
        <div className="dino-play-column">
          {!email ? (
            <form className="dino-email-gate" onSubmit={handleEmailSubmit}>
              <div>
                <strong>{tr('Skorun kime ait?', 'Who owns this score?')}</strong>
                <span>{tr('Oynamak ve sıralamaya katılmak için ÖzÜ e-postanı gir.', 'Enter your ÖzÜ email to play and join the leaderboard.')}</span>
              </div>
              <div className="dino-email-controls">
                <input
                  type="email"
                  value={emailInput}
                  onChange={event => setEmailInput(event.target.value)}
                  placeholder="name@ozu.edu.tr"
                  autoComplete="email"
                  aria-label={tr('ÖzÜ e-posta adresi', 'ÖzÜ email address')}
                />
                <button type="submit" disabled={scoreSaving}>{tr('Devam et', 'Continue')}</button>
              </div>
              {emailError && <span className="dino-email-error" role="alert">{emailError}</span>}
              <small>{tr('Tam adresin sıralamada gösterilmez.', 'Your full address is never shown on the leaderboard.')}</small>
            </form>
          ) : (
            <div className="dino-player-row">
              <span>{email.split('@')[0]}</span>
              <button type="button" onClick={() => {
                gameRef.current = null
                setRunning(false)
                setGameOver(false)
                setScore(0)
                setHighScore(0)
                setEmail('')
                setEmailInput(email)
              }}>{tr('E-postayı değiştir', 'Change email')}</button>
            </div>
          )}

          <div className="dino-scorebar" aria-live="polite">
            <span>{tr('Skor', 'Score')} <strong>{String(score).padStart(5, '0')}</strong></span>
            <span>{tr('En iyi', 'Best')} <strong>{String(highScore).padStart(5, '0')}</strong></span>
            {scoreSaving && <span>{tr('Kaydediliyor…', 'Saving…')}</span>}
          </div>

          <button type="button" className="dino-stage" onPointerDown={jump} aria-label={tr('Zıpla', 'Jump')} disabled={!email}>
            <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} />
            {!running && email && (
              <span className="dino-game-message">
                <strong>{gameOver ? tr('Oyun bitti', 'Game over') : tr('Koşmaya hazır', 'Ready to run')}</strong>
                <span>{tr('Zıplamak için dokun veya Space / ↑ tuşuna bas', 'Tap or press Space / ↑ to jump')}</span>
              </span>
            )}
          </button>

          <footer className="dino-game-footer">
            <span>{tr('Space / ↑ veya oyuna dokun', 'Space / ↑ or tap the game')}</span>
            <button type="button" onClick={jump} disabled={!email}>{gameOver ? tr('Tekrar oyna', 'Play again') : tr('Zıpla', 'Jump')}</button>
          </footer>
        </div>

        <aside className="dino-leaderboard" aria-label={tr('Tüm zamanlar sıralaması', 'All-time leaderboard')}>
          <header>
            <div><span>{tr('Tüm zamanlar', 'All time')}</span><strong>{tr('En yüksek skorlar', 'High scores')}</strong></div>
            <button type="button" onClick={refreshLeaderboard} aria-label={tr('Sıralamayı yenile', 'Refresh leaderboard')}>↻</button>
          </header>
          {leaderboardLoading ? (
            <p>{tr('Sıralama yükleniyor…', 'Loading leaderboard…')}</p>
          ) : leaderboard.length ? (
            <ol>
              {leaderboard.map(player => (
                <li key={player.player} className={email.startsWith(`${player.player}@`) ? 'dino-leaderboard-me' : ''}>
                  <span className="dino-rank">#{player.rank}</span>
                  <span className="dino-player-name">{player.player}</span>
                  <strong>{String(player.bestScore).padStart(5, '0')}</strong>
                </li>
              ))}
            </ol>
          ) : (
            <p>{tr('İlk rekoru sen bırak.', 'Set the first record.')}</p>
          )}
        </aside>
      </div>
    </section>
  )
}

export default DinoGame
