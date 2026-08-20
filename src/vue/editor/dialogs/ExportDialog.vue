<script setup lang="ts">
/**
 * 과제 내보내기 팝업 (기획 3.4). **옵션 컴포넌트다.**
 *
 * ## 경계
 *
 * 과제(Assignment) 생성, Class 목록 조회, 링크·QR 발급은 모두 호스트 앱의 서버 도메인이다
 * (PLAN 10). 그래서 이 컴포넌트는 **폼 상태만 관리**하고 `submit` 으로 설정값을 넘긴다.
 * 호스트가 API를 호출한 뒤 결과(`result` prop)를 되돌려주면 링크·QR 영역을 보여준다.
 *
 * 이 분리 덕분에 호스트는 자기 팝업을 쓰거나 이 컴포넌트를 쓰거나 선택할 수 있고, 어느 쪽이든
 * 검증 게이트(`request-export`)는 동일하게 통과한다.
 *
 * QR 이미지도 호스트가 URL로 준다. QR 생성 라이브러리를 번들에 넣으면 대부분의 소비자가 쓰지 않는
 * 코드를 함께 받는다.
 */
import { computed, ref, watch } from 'vue'
import { LIMITS } from '../../../core/config/defaults'
import { copyText } from '../../../core/util/id'

/** 기획 3.4의 공개 범위. */
export type AccessLevel = 'public' | 'class'

/** 제출 횟수. Class Only에서만 노출된다 (기획 3.3). */
export type SubmitLimit = 'once' | 'multiple'

export interface ExportSettings {
  title: string
  accessLevel: AccessLevel
  /** Class Only일 때의 대상 Class id. */
  classId: string | null
  submitLimit: SubmitLimit
  /** 로컬 날짜 문자열(`YYYY-MM-DD`). 없으면 기한 없음. */
  dueDate: string | null
}

export interface ExportResult {
  /** 학생에게 전달할 고유 링크. */
  url: string
  /** QR 이미지 URL. 호스트가 생성한다. */
  qrUrl?: string
}

const props = defineProps<{
  /** 제목 기본값. 워크시트 타이틀을 프리필한다 (기획 4.2 관계). */
  defaultTitle: string
  /** Teacher의 Class 목록. 호스트가 조회해 넘긴다. */
  classes?: { id: string; name: string }[]
  /** 내보내기 진행 중이면 true. 버튼을 잠근다. */
  busy?: boolean
  /** 서버 실패 문구. */
  error?: string | null
  /** 내보내기 성공 결과. 있으면 링크·QR 영역을 보여준다. */
  result?: ExportResult | null
  t: (key: string, vars?: Record<string, unknown>) => string
}>()

const emit = defineEmits<{
  close: []
  submit: [settings: ExportSettings]
}>()

const title = ref(props.defaultTitle)
const accessLevel = ref<AccessLevel>('public')
const classId = ref<string | null>(null)
const submitLimit = ref<SubmitLimit>('once')
const dueDate = ref<string>('')
const copied = ref(false)

// 워크시트 타이틀이 바뀌면 아직 손대지 않은 제목을 따라가게 한다.
const titleTouched = ref(false)
watch(
  () => props.defaultTitle,
  (v) => {
    if (!titleTouched.value) title.value = v
  },
)

const isClassOnly = computed(() => accessLevel.value === 'class')

/** 필수값이 채워졌는지. 기획 3.4는 미충족 시 버튼 비활성을 요구한다. */
const canSubmit = computed(() => {
  if (props.busy) return false
  if (title.value.trim().length === 0) return false
  if (isClassOnly.value && !classId.value) return false
  return true
})

function onSubmit() {
  if (!canSubmit.value) return
  emit('submit', {
    title: title.value.trim(),
    accessLevel: accessLevel.value,
    classId: isClassOnly.value ? classId.value : null,
    submitLimit: isClassOnly.value ? submitLimit.value : 'multiple',
    dueDate: dueDate.value || null,
  })
}

async function copyLink() {
  const url = props.result?.url
  if (!url) return
  // `navigator.clipboard` 는 secure context 전용이라 LAN 주소에서는 없다. copyText 가
  // execCommand 폴백까지 시도하고, 그래도 실패하면 false를 돌려준다.
  const ok = await copyText(url)
  copied.value = ok
  if (ok) window.setTimeout(() => (copied.value = false), 1600)
}
</script>

<template>
  <div class="pck-modal-scrim" @click.self="props.busy ? null : emit('close')">
    <section
      class="pck-modal"
      role="dialog"
      aria-modal="true"
      :aria-label="props.t('export.title')"
    >
      <header class="pck-modal-head">
        <h2>{{ props.t('export.title') }}</h2>
        <button
          type="button"
          class="pck-icon-btn"
          :disabled="props.busy"
          aria-label="close"
          @click="emit('close')"
        >
          ×
        </button>
      </header>

      <div class="pck-modal-body pck-modal-body--form">
        <!-- 내보낸 뒤에는 링크·QR만 보여준다. 설정을 다시 만지면 이미 만든 과제와 어긋난다. -->
        <template v-if="props.result">
          <p class="pck-field-label">{{ props.t('export.link') }}</p>
          <div class="pck-row">
            <input class="pck-input" type="text" readonly :value="props.result.url" />
            <button type="button" class="pck-ghost-btn" @click="copyLink">
              {{ copied ? props.t('export.copied') : props.t('export.copy') }}
            </button>
          </div>
          <img
            v-if="props.result.qrUrl"
            class="pck-export-qr"
            :src="props.result.qrUrl"
            :alt="props.t('export.qr')"
          />
          <p class="pck-field-note">{{ props.t('export.afterNote') }}</p>
        </template>

        <template v-else>
          <label class="pck-field">
            <span class="pck-field-label">{{ props.t('export.name') }}</span>
            <input
              v-model="title"
              class="pck-input"
              type="text"
              :maxlength="LIMITS.titleChars"
              :placeholder="props.t('export.namePlaceholder')"
              @input="titleTouched = true"
            />
          </label>

          <fieldset class="pck-field pck-fieldset">
            <legend class="pck-field-label">{{ props.t('export.access') }}</legend>
            <label class="pck-field--inline">
              <input v-model="accessLevel" class="pck-check" type="radio" value="public" />
              <span>{{ props.t('export.public') }}</span>
            </label>
            <label class="pck-field--inline">
              <input v-model="accessLevel" class="pck-check" type="radio" value="class" />
              <span>{{ props.t('export.classOnly') }}</span>
            </label>
          </fieldset>

          <template v-if="isClassOnly">
            <label class="pck-field">
              <span class="pck-field-label">{{ props.t('export.class') }}</span>
              <select v-model="classId" class="pck-input">
                <option :value="null" disabled>{{ props.t('export.classPlaceholder') }}</option>
                <option v-for="c in props.classes ?? []" :key="c.id" :value="c.id">
                  {{ c.name }}
                </option>
              </select>
              <span v-if="(props.classes ?? []).length === 0" class="pck-field-note">
                {{ props.t('export.noClasses') }}
              </span>
            </label>

            <fieldset class="pck-field pck-fieldset">
              <legend class="pck-field-label">{{ props.t('export.submitLimit') }}</legend>
              <label class="pck-field--inline">
                <input v-model="submitLimit" class="pck-check" type="radio" value="once" />
                <span>{{ props.t('export.submitOnce') }}</span>
              </label>
              <label class="pck-field--inline">
                <input v-model="submitLimit" class="pck-check" type="radio" value="multiple" />
                <span>{{ props.t('export.submitMultiple') }}</span>
              </label>
            </fieldset>
          </template>

          <label class="pck-field">
            <span class="pck-field-label">{{ props.t('export.due') }}</span>
            <input v-model="dueDate" class="pck-input" type="date" />
            <span class="pck-field-note">{{ props.t('export.dueNote') }}</span>
          </label>

          <p v-if="props.error" class="pck-field-error" role="alert">{{ props.error }}</p>

          <button
            type="button"
            class="pck-primary-btn pck-export-submit"
            :disabled="!canSubmit"
            @click="onSubmit"
          >
            {{ props.busy ? props.t('export.submitting') : props.t('export.submit') }}
          </button>
        </template>
      </div>
    </section>
  </div>
</template>
