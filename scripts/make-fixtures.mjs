/**
 * spike 화면에 필요한 PDF 픽스처를 생성한다.
 *
 * 실제로 페이지 렌더링을 깨뜨리는 케이스들을 확인하려고 존재한다. 한 파일에 크기가 다른 페이지,
 * /Rotate 값, MediaBox와 다른 CropBox, 그리고 변환 비용을 측정할 만큼 많은 페이지 수.
 */
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, '../demo/fixtures')

const PAPER = {
  a4: [595.28, 841.89],
  a3: [841.89, 1190.55],
  a5: [419.53, 595.28],
  letter: [612, 792],
  legal: [612, 1008],
}

/** 라벨과 테두리를 그려 방향과 크롭 여부를 한눈에 볼 수 있게 한다. */
function decorate(page, font, label) {
  const { width, height } = page.getSize()
  page.drawRectangle({
    x: 12,
    y: 12,
    width: width - 24,
    height: height - 24,
    borderColor: rgb(0.75, 0.75, 0.75),
    borderWidth: 2,
  })
  page.drawText(label, { x: 32, y: height - 56, size: 22, font, color: rgb(0.1, 0.1, 0.1) })
  page.drawText(`${Math.round(width)} x ${Math.round(height)} pt`, {
    x: 32,
    y: height - 84,
    size: 13,
    font,
    color: rgb(0.45, 0.45, 0.45),
  })
  // 코너 마커가 있으면 페이지가 회전되거나 잘려 렌더됐을 때 바로 드러난다.
  for (const [cx, cy, name] of [
    [24, height - 24, 'TL'],
    [width - 56, height - 24, 'TR'],
    [24, 30, 'BL'],
    [width - 56, 30, 'BR'],
  ]) {
    page.drawText(name, { x: cx, y: cy - 14, size: 10, font, color: rgb(0.6, 0.2, 0.2) })
  }
}

async function mixedSize() {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const specs = [
    ['A4 portrait', PAPER.a4],
    ['A3 portrait', PAPER.a3],
    ['A5 portrait', PAPER.a5],
    ['Letter landscape', [PAPER.letter[1], PAPER.letter[0]]],
    ['Legal portrait', PAPER.legal],
    ['A4 landscape', [PAPER.a4[1], PAPER.a4[0]]],
  ]
  specs.forEach(([label, [w, h]], i) => {
    const page = doc.addPage([w, h])
    decorate(page, font, `${i + 1}. ${label}`)
  })
  return doc.save()
}

async function rotated90() {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (const deg of [0, 90, 180, 270]) {
    const page = doc.addPage(PAPER.a4)
    decorate(page, font, `Rotate ${deg}`)
    page.setRotation({ type: 'degrees', angle: deg })
  }
  return doc.save()
}

async function croppedBox() {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const page = doc.addPage(PAPER.a4)
  const inset = 100
  const [w, h] = PAPER.a4

  decorate(page, font, 'CropBox inset 100pt on every side')

  // 크롭 영역 *안쪽*의 내용. 정상 렌더가 눈에 보이게 비어 있지 않도록 한다.
  // 이게 없으면 보이는 페이지가 빈 종이라, 픽스처가 정상 렌더러와 깨진 렌더러를 구분할 수 없다.
  page.drawRectangle({
    x: inset + 20,
    y: inset + 20,
    width: w - 2 * inset - 40,
    height: h - 2 * inset - 40,
    borderColor: rgb(0.2, 0.4, 0.7),
    borderWidth: 3,
  })
  page.drawText('INSIDE CROPBOX', {
    x: inset + 40,
    y: h - inset - 60,
    size: 20,
    font,
    color: rgb(0.1, 0.1, 0.1),
  })
  page.drawText('this text must be visible after cropping', {
    x: inset + 40,
    y: h - inset - 90,
    size: 12,
    font,
    color: rgb(0.35, 0.35, 0.35),
  })
  // 크롭 영역 바로 밖의 마커. 렌더 결과에 나타나면 안 된다.
  page.drawText('OUTSIDE — should be cropped away', {
    x: 20,
    y: 40,
    size: 12,
    font,
    color: rgb(0.8, 0.2, 0.2),
  })

  // pdf.js는 CropBox를 렌더하므로 페이지가 395.28 x 641.89 pt 로 나와야 한다.
  page.setCropBox(inset, inset, w - 2 * inset, h - 2 * inset)
  return doc.save()
}

async function a4ThreePage() {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= 3; i++) {
    decorate(doc.addPage(PAPER.a4), font, `A4 page ${i} of 3`)
  }
  return doc.save()
}

async function large(count = 100) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= count; i++) {
    const page = doc.addPage(PAPER.a4)
    decorate(page, font, `Page ${i} / ${count}`)
    // 래스터화가 지나치게 싸지 않도록 본문 텍스트를 넣는다.
    for (let line = 0; line < 30; line++) {
      page.drawText(
        `Lorem ipsum dolor sit amet, consectetur adipiscing elit ${line + 1} of page ${i}.`,
        { x: 48, y: 700 - line * 20, size: 11, font, color: rgb(0.2, 0.2, 0.2) },
      )
    }
  }
  return doc.save()
}

/**
 * CID 키 임베드 폰트를 쓰는 한국어 페이지. 실제 교재의 형태이며, CMap 설정이 빠졌을 때
 * 글리프가 사라지는 케이스다.
 *
 * pdf-lib은 폰트 파일 없이 CJK 폰트를 임베드할 수 없어서 headless Chrome의 HTML 인쇄로 만든다.
 * Chrome이 없으면 건너뛴다.
 */
async function koreanPage() {
  const { execFileSync } = await import('node:child_process')
  const { readFile, writeFile: write } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  if (!(await stat(chrome).catch(() => null))) return null

  const html = `<html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 20mm }
    body { font-family: 'AppleGothic', 'Apple SD Gothic Neo', sans-serif }
  </style></head><body>
    <h1>한글 텍스트 렌더링 확인</h1>
    <p style="font-size:16pt">이 문장이 보이면 폰트 설정이 정상이다.</p>
    <p style="font-size:14pt">1번. 다음 중 옳은 것을 고르시오. 의사소통 역량 향상</p>
    <p style="font-size:14pt;font-family:Helvetica">Latin: The quick brown fox jumps over the lazy dog.</p>
    <p style="font-size:12pt">내가 이 단원에서 알고 싶은 것</p>
  </body></html>`

  const htmlPath = resolve(tmpdir(), 'ws-korean-fixture.html')
  const pdfPath = resolve(tmpdir(), 'ws-korean-fixture.pdf')
  await write(htmlPath, html, 'utf-8')
  execFileSync(chrome, [
    '--headless',
    '--disable-gpu',
    '--no-pdf-header-footer',
    `--print-to-pdf=${pdfPath}`,
    htmlPath,
  ])
  return new Uint8Array(await readFile(pdfPath))
}

/** 구조적으로 깨진 파일. 실패 경로를 확인하는 용도. */
function corrupt() {
  const head = '%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'
  // 잘린 파일. xref도 trailer도 없고 객체 참조가 끊겨 있다.
  return new TextEncoder().encode(head + '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1')
}

const korean = await koreanPage().catch(() => null)

const fixtures = [
  ['mixed-size.pdf', await mixedSize()],
  ['rotated-90.pdf', await rotated90()],
  ['cropbox.pdf', await croppedBox()],
  ['a4-3page.pdf', await a4ThreePage()],
  ['large-100page.pdf', await large(100)],
  ['corrupt.pdf', corrupt()],
  ...(korean ? [['korean.pdf', korean]] : []),
]

await mkdir(outDir, { recursive: true })
for (const [name, bytes] of fixtures) {
  await writeFile(resolve(outDir, name), bytes)
  console.log(`${name.padEnd(20)} ${(bytes.byteLength / 1024).toFixed(0)} KB`)
}
if (!korean) {
  console.warn('skipped korean.pdf (needs Google Chrome to print HTML with a CJK font)')
}
console.log(`\nwrote ${fixtures.length} fixtures to demo/fixtures/`)
