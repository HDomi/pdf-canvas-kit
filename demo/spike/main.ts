/**
 * M1 스파이크. PDF를 페이지 이미지로 바꾸고 변환 결과를 그대로 보여준다.
 *
 * 위험한 사실들을 눈에 보이게 만드는 것이 목적이다 — 페이지별 pt 크기, 래스터 픽셀 크기,
 * 사용한 배율, 소요 시간 (PLAN M1 DoD).
 */
import { createId } from '../../src/core/util/id'
import {
  configurePdfResources,
  ConvertError,
  createBlobAssetPort,
  createPdfjsConverter,
  diagnoseFonts,
  formatPaperLabel,
  loadPdf,
  type PageBackground,
  type RasterPage,
  type PDFCanvasPage,
} from 'pdf-canvas-kit'

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id)
  if (!el) throw new Error(`missing #${id}`)
  return el as T
}

const fileInput = $<HTMLInputElement>('file')
const statusBox = $('status')
const summaryBox = $('summary')
const pagesBox = $('pages')
const diagBox = $('diagnostics')
const cancelBtn = $<HTMLButtonElement>('cancel')
const targetPxInput = $<HTMLInputElement>('targetPx')
const mimeSelect = $<HTMLSelectElement>('mime')
const qualityInput = $<HTMLInputElement>('quality')

/**
 * pdf.js loads CMaps, standard fonts and wasm decoders from URLs at runtime.
 * `npm run copy:pdfjs` puts them under demo/public/pdfjs; without cmaps/, text in
 * Korean PDFs silently disappears (src/core/pdf/resources.ts).
 */
const params = new URLSearchParams(location.search)

/** `?resources=off` 는 비교를 위해 글리프 소실 버그를 의도적으로 재현한다. */
const skipResources = params.get('resources') === 'off'

/**
 * `?fontface=off` 이면 FontFace API로 폰트를 등록하는 대신 글리프 아웃라인을 그린다.
 * 한국어 CID 페이지에서 아웃라인 모드가 잉크를 약 6% 놓쳤으므로, 명시적으로 끄지 않는 한
 * FontFace(pdf.js 기본값)를 유지한다.
 */
const fontFaceOff = params.get('fontface') === 'off'

// CMap 누락 버그를 재현할 때조차 worker는 항상 필요하다.
configurePdfResources({ workerSrc: '/pdfjs/pdf.worker.mjs' })

if (!skipResources) {
  configurePdfResources({
    // npm run copy:pdfjs 가 서빙해 준다. 앱에서는 번들러 import
    // (`from 'pdfjs-dist/build/pdf.worker.mjs?url'`) 도 똑같이 잘 동작한다.
    workerSrc: '/pdfjs/pdf.worker.mjs',
    cMapUrl: '/pdfjs/cmaps/',
    standardFontDataUrl: '/pdfjs/standard_fonts/',
    wasmUrl: '/pdfjs/wasm/',
    iccUrl: '/pdfjs/iccs/',
  })
}

const assets = createBlobAssetPort()
let controller: AbortController | null = null

const FIXTURES = [
  ['mixed-size.pdf', '크기 혼합 6p'],
  ['rotated-90.pdf', 'Rotate 0/90/180/270'],
  ['cropbox.pdf', 'CropBox ≠ MediaBox'],
  ['a4-3page.pdf', 'A4 3p'],
  ['korean.pdf', '한글 CID 폰트'],
  ['large-100page.pdf', 'A4 100p (성능)'],
  ['corrupt.pdf', '손상 파일 (실패 경로)'],
] as const

function renderFixtureButtons() {
  const host = $('fixtures')
  for (const [name, label] of FIXTURES) {
    const b = document.createElement('button')
    b.textContent = label
    b.title = name
    b.addEventListener('click', () => {
      void runFixture(name)
    })
    host.append(b)
  }
}

function setStatus(html: string, ratio?: number) {
  statusBox.hidden = false
  statusBox.innerHTML =
    html +
    (ratio === undefined ? '' : `<div class="bar"><i style="width:${ratio * 100}%"></i></div>`)
}

function bytes(n: number): string {
  return n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`
}

/** 실제 컨버터 → 문서 단계가 할 일을 그대로 흉내낸다 (PLAN 10.1). */
async function toPDFCanvasPages(raster: RasterPage[]): Promise<PDFCanvasPage[]> {
  const pages: PDFCanvasPage[] = []
  for (const r of raster) {
    const id = createId()
    const asset = await assets.persist(r.blob, { pageId: id, mime: r.blob.type })
    const background: PageBackground = {
      kind: 'image',
      url: asset.url,
      origin: asset.origin,
      naturalWidth: r.naturalWidth,
      naturalHeight: r.naturalHeight,
      renderScale: r.renderScale,
    }
    if (asset.assetId !== undefined) background.assetId = asset.assetId
    pages.push({ id, size: r.size, background, objects: [] })
  }
  return pages
}

function renderPages(pages: PDFCanvasPage[], raster: RasterPage[]) {
  pagesBox.replaceChildren()

  pages.forEach((page, i) => {
    const r = raster[i]
    if (!r) return
    const bg = page.background
    if (bg.kind !== 'image') return

    const el = document.createElement('div')
    el.className = 'page'

    // CSS px 폭 = pt 값. 이게 PLAN 5.3의 요점이다. 래스터 픽셀 크기는 레이아웃에 전혀
    // 등장하지 않으므로, 다른 해상도로 다시 렌더해도 아무것도 움직이지 않는다.
    const shown = Math.min(240, page.size.width)
    el.innerHTML = `
      <figure style="width:${shown}px; aspect-ratio:${page.size.width} / ${page.size.height}">
        <img src="${bg.url}" alt="page ${i + 1}" loading="lazy" />
      </figure>
      <table class="meta">
        <tbody>
          <tr><td>page</td><td class="mono">${i + 1} / ${pages.length}</td></tr>
          <tr><td>size (pt)</td><td class="mono">${page.size.width.toFixed(2)} × ${page.size.height.toFixed(2)}</td></tr>
          <tr><td>paper</td><td>${formatPaperLabel(page.size)}</td></tr>
          <tr><td>raster (px)</td><td class="mono">${bg.naturalWidth} × ${bg.naturalHeight}</td></tr>
          <tr><td>rotate</td><td class="mono">${
            r.rotation === 0
              ? '0°'
              : `<strong>${r.rotation}°</strong> <span class="muted">(size에 이미 반영됨)</span>`
          }</td></tr>
          <tr><td>renderScale</td><td class="mono">${bg.renderScale.toFixed(3)}</td></tr>
          <tr><td>blob</td><td class="mono">${r.blob.type} · ${bytes(r.blob.size)}</td></tr>
          <tr><td>origin</td><td class="mono">${bg.origin}</td></tr>
        </tbody>
      </table>`
    pagesBox.append(el)
  })
}

/** rotate 값별 페이지 수. 회전된 페이지가 섞여 있는지 한눈에 본다. */
function rotationSummary(raster: RasterPage[]): string {
  const counts = new Map<number, number>()
  for (const r of raster) counts.set(r.rotation, (counts.get(r.rotation) ?? 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([deg, n]) => `${deg}° × ${n}`)
    .join(' · ')
}

function renderSummary(
  file: { name: string; size: number },
  raster: RasterPage[],
  ms: number,
  pages: PDFCanvasPage[],
) {
  const totalBytes = raster.reduce((n, r) => n + r.blob.size, 0)
  const sizes = new Set(pages.map((p) => `${p.size.width.toFixed(0)}x${p.size.height.toFixed(0)}`))
  summaryBox.hidden = false
  summaryBox.innerHTML = `
    <table>
      <tbody>
        <tr><td>file</td><td class="mono">${file.name} · ${bytes(file.size)}</td></tr>
        <tr><td>pages</td><td class="mono">${pages.length}</td></tr>
        <tr><td>distinct page sizes</td><td class="mono">${sizes.size} <span class="muted">(${[...sizes].join(', ')})</span></td></tr>
        <tr><td>rotate 분포</td><td class="mono">${rotationSummary(raster)}</td></tr>
        <tr><td>elapsed</td><td class="mono">${ms.toFixed(0)} ms · ${(ms / pages.length).toFixed(1)} ms/page</td></tr>
        <tr><td>image bytes</td><td class="mono">${bytes(totalBytes)} · ${bytes(totalBytes / pages.length)}/page</td></tr>
        <tr><td>live blob URLs</td><td class="mono">${assets.size}</td></tr>
      </tbody>
    </table>`
}

/**
 * 텍스트·폰트 리포트. "PDF에 텍스트가 없는 건가, 렌더가 실패한 건가?" 에 답한다 —
 * 둘은 화면상 똑같아 보인다 (src/core/pdf/diagnose.ts).
 */
async function renderDiagnostics(file: File) {
  diagBox.hidden = false
  diagBox.innerHTML = '<span class="muted">폰트 · 텍스트 진단 중…</span>'

  const { pdf, dispose } = await loadPdf(file, {
    skipResources,
    ...(fontFaceOff ? { useFontFace: false } : {}),
  })
  let report
  try {
    report = await diagnoseFonts(pdf, { maxPages: 5 })
  } finally {
    await dispose()
  }

  const esc = (t: string) => t.replace(/[<>&]/g, (c) => `&#${c.charCodeAt(0)};`)

  const rows = report.pages
    .map((r) => {
      const text =
        r.charCount === 0
          ? '<span class="warn">0자</span>'
          : `<span class="ok">${r.charCount}자</span> <span class="muted mono">${esc(r.sample)}</span>`
      const fonts = r.fonts.length
        ? r.fonts.map((f) => `<div class="mono">${esc(f.name)}</div>`).join('')
        : '<span class="muted">없음</span>'
      return `<tr><td>p${r.page}</td><td>${text}</td><td>${fonts}</td></tr>`
    })
    .join('')

  const notes: string[] = []
  if (report.imageOnly) {
    notes.push(
      '<span class="warn">텍스트 0자</span> — 이 PDF는 이미지로만 구성돼 있다. 글자가 안 보이는 게 아니라 텍스트 객체가 없다.',
    )
  }
  // 알려진 원인을 먼저 보여준다. pdf.js가 폰트마다 같은 줄을 반복하므로,
  // 원문 목록은 조치 가능한 한 줄을 묻어 버린다.
  for (const issue of report.issues) {
    notes.push(
      `<span class="warn"><strong>${issue.code}</strong> (경고 ${issue.count}건)</span><br>${esc(
        issue.explain,
      )}`,
    )
  }

  if (report.warnings.length) {
    const total = report.warnings.reduce((n, w) => n + w.count, 0)
    notes.push(
      `<details><summary class="muted">pdf.js 경고 원문 ${report.warnings.length}종 / ${total}건</summary>` +
        `<pre class="mono warnings">${esc(
          report.warnings.map((w) => `${w.count}x  ${w.message}`).join('\n'),
        )}</pre></details>`,
    )
  } else {
    notes.push('<span class="ok">pdf.js 경고 없음</span> — 폰트 로딩 단계에서 보고된 문제가 없다.')
  }

  diagBox.innerHTML = `
    <strong>폰트 · 텍스트 진단</strong>
    <span class="muted">앞 ${report.pages.length}페이지 · 리소스 ${
      skipResources ? '<span class="warn">off</span>' : 'on'
    } · FontFace ${fontFaceOff ? '<span class="warn">off</span>' : 'on'}</span>
    <table style="margin-top:8px">
      <thead><tr><th>page</th><th>text (getTextContent)</th><th>fonts</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:10px">${notes.map((n) => `<p style="margin:6px 0">${n}</p>`).join('')}</div>
    <p class="muted" style="margin:10px 0 0">
      글자가 렌더되지 않으면: 텍스트 문자 수가 0인지(이미지 PDF), pdf.js 경고에 폰트 이름이 있는지 확인한다.
      <code>?resources=off</code> 로 CMap 없이 비교해 볼 수 있다.
    </p>`
}

async function convert(file: File) {
  controller?.abort()
  controller = new AbortController()
  cancelBtn.disabled = false
  summaryBox.hidden = true
  diagBox.hidden = true
  pagesBox.replaceChildren()

  const targetPx = Number(targetPxInput.value)
  const quality = Number(qualityInput.value)
  const converter = createPdfjsConverter({
    ...(Number.isFinite(targetPx) && targetPx > 0 ? { targetPx } : {}),
    ...(Number.isFinite(quality) && quality > 0 ? { quality } : {}),
    mime: mimeSelect.value,
    skipResources,
    ...(fontFaceOff ? { useFontFace: false } : {}),
  })

  setStatus(`<strong>${file.name}</strong> 변환 중…`, 0)
  const t0 = performance.now()

  try {
    const raster = await converter.convert(file, {
      signal: controller.signal,
      onProgress: (p) =>
        setStatus(`<strong>${file.name}</strong> ${p.page} / ${p.total} 페이지`, p.ratio),
    })
    const ms = performance.now() - t0

    const pages = await toPDFCanvasPages(raster)
    setStatus(`<span class="ok">완료</span> — ${pages.length} 페이지, ${ms.toFixed(0)} ms`)
    renderSummary(file, raster, ms, pages)
    renderPages(pages, raster)
    // 진단은 정보 제공용이다. 여기서 실패해도 변환 결과를 가려서는 안 된다.
    await renderDiagnostics(file).catch((e: unknown) => {
      diagBox.hidden = false
      diagBox.innerHTML = `<span class="warn">진단 실패</span> <span class="mono">${String(e)}</span>`
    })
  } catch (err) {
    if (err instanceof ConvertError) {
      setStatus(`<span class="warn">실패 [${err.code}]</span> ${err.message}`)
    } else {
      setStatus(`<span class="warn">실패</span> ${String(err)}`)
      console.error(err)
    }
  } finally {
    cancelBtn.disabled = true
    controller = null
  }
}

async function runFixture(name: string) {
  setStatus(`픽스처 <code>${name}</code> 불러오는 중…`)
  const res = await fetch(`/fixtures/${name}`)
  if (!res.ok) {
    setStatus(
      `<span class="warn">픽스처 없음</span> <code>demo/fixtures/${name}</code> — <code>npm run fixtures</code> 를 먼저 실행한다.`,
    )
    return
  }
  const blob = await res.blob()
  await convert(new File([blob], name, { type: 'application/pdf' }))
}

$('pick').addEventListener('click', () => fileInput.click())
fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0]
  if (f) void convert(f)
})
cancelBtn.addEventListener('click', () => controller?.abort())

// 화면 전체에 드래그 앤 드롭을 받는다. 교사가 가장 먼저 시도할 방식이다.
document.addEventListener('dragover', (e) => e.preventDefault())
document.addEventListener('drop', (e) => {
  e.preventDefault()
  const f = e.dataTransfer?.files?.[0]
  if (f) void convert(f)
})

renderFixtureButtons()

/**
 * `?run=<fixture>&targetPx=…&mime=…` 이면 로드하면서 바로 변환한다. 링크 공유에 편하고,
 * headless 브라우저가 클릭 없이 파이프라인을 확인할 수 있게 한다.
 */
const qTargetPx = params.get('targetPx')
if (qTargetPx) targetPxInput.value = qTargetPx
const qMime = params.get('mime')
if (qMime) mimeSelect.value = qMime
const qQuality = params.get('quality')
if (qQuality) qualityInput.value = qQuality

const autoRun = params.get('run')
if (autoRun) {
  document.body.dataset['spikeState'] = 'running'
  void runFixture(autoRun).then(() => {
    document.body.dataset['spikeState'] = 'done'
  })
} else {
  setStatus('PDF 파일을 선택하거나 이 화면에 끌어다 놓는다.')
}
