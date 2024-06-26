<script setup lang="ts">
import { transform } from 'sucrase'

import Message from '../Message.vue'
import {
  type Ref,
  type WatchStopHandle,
  inject,
  onMounted,
  onUnmounted,
  ref,
  watch,
  watchEffect,
} from 'vue'
import srcdoc from './srcdoc.html?raw'
import { PreviewProxy } from './PreviewProxy'
import { compileModulesForPreview } from './moduleCompiler'
import type { Props } from '../Repl.vue'
import { injectKeyStore } from '../../src/types'

defineProps<{ show: boolean }>()

const store = inject(injectKeyStore)!
const clearConsole = inject<Ref<boolean>>('clear-console')!
const theme = inject<Ref<'dark' | 'light'>>('theme')!
const previewTheme = inject<Ref<boolean>>('preview-theme')!

const previewOptions = inject<Props['previewOptions']>('preview-options')

const container = ref()
const runtimeError = ref()
const runtimeWarning = ref()

let sandbox: HTMLIFrameElement
let proxy: PreviewProxy
let stopUpdateWatcher: WatchStopHandle | undefined

// create sandbox on mount
onMounted(createSandbox)

// reset sandbox when import map changes
watch(
  () => store.getImportMap(),
  () => {
    try {
      createSandbox()
    } catch (e: any) {
      store.errors = [e as Error]
      return
    }
  },
)

function switchPreviewTheme() {
  if (!previewTheme.value) return

  const html = sandbox.contentDocument?.documentElement
  if (html) {
    html.className = theme.value
  } else {
    // re-create sandbox
    createSandbox()
  }
}

// reset theme
watch([theme, previewTheme], switchPreviewTheme)

onUnmounted(() => {
  proxy.destroy()
  stopUpdateWatcher && stopUpdateWatcher()
})

function createSandbox() {
  if (sandbox) {
    // clear prev sandbox
    proxy.destroy()
    stopUpdateWatcher && stopUpdateWatcher()
    container.value.removeChild(sandbox)
  }

  sandbox = document.createElement('iframe')
  sandbox.setAttribute(
    'sandbox',
    [
      'allow-forms',
      'allow-modals',
      'allow-pointer-lock',
      'allow-popups',
      'allow-same-origin',
      'allow-scripts',
      'allow-top-navigation-by-user-activation',
    ].join(' '),
  )

  const importMap = store.getImportMap()
  const sandboxSrc = srcdoc
    .replace(
      /<html>/,
      `<html class="${previewTheme.value ? theme.value : ''}">`,
    )
    .replace(/<!--IMPORT_MAP-->/, JSON.stringify(importMap))
    .replace(
      /<!-- PREVIEW-OPTIONS-HEAD-HTML -->/,
      previewOptions?.headHTML || '',
    )
    .replace(
      /<!--PREVIEW-OPTIONS-PLACEHOLDER-HTML-->/,
      previewOptions?.placeholderHTML || '',
    )
  sandbox.srcdoc = sandboxSrc
  container.value.appendChild(sandbox)

  proxy = new PreviewProxy(sandbox, {
    on_fetch_progress: (progress: any) => {
      // pending_imports = progress;
    },
    on_error: (event: any) => {
      const msg =
        event.value instanceof Error ? event.value.message : event.value
      if (
        msg.includes('Failed to resolve module specifier') ||
        msg.includes('Error resolving module specifier')
      ) {
        runtimeError.value =
          msg.replace(/\. Relative references must.*$/, '') +
          `.\nTip: edit the "Import Map" tab to specify import paths for dependencies.`
      } else {
        runtimeError.value = event.value
      }
    },
    on_unhandled_rejection: (event: any) => {
      let error = event.value
      if (typeof error === 'string') {
        error = { message: error }
      }
      runtimeError.value = 'Uncaught (in promise): ' + error.message
    },
    on_console: (log: any) => {
      if (log.duplicate) {
        return
      }
      if (log.level === 'error') {
        if (log.args[0] instanceof Error) {
          runtimeError.value = log.args[0].message
        } else {
          runtimeError.value = log.args[0]
        }
      } else if (log.level === 'warn') {
        if (log.args[0].toString().includes('[Vue warn]')) {
          runtimeWarning.value = log.args
            .join('')
            .replace(/\[Vue warn\]:/, '')
            .trim()
        }
      }
    },
    on_console_group: (action: any) => {
      // group_logs(action.label, false);
    },
    on_console_group_end: () => {
      // ungroup_logs();
    },
    on_console_group_collapsed: (action: any) => {
      // group_logs(action.label, true);
    },
  })

  sandbox.addEventListener('load', () => {
    proxy.handle_links()
    stopUpdateWatcher = watchEffect(updatePreview)
    switchPreviewTheme()
  })
}

async function updatePreview() {
  if (import.meta.env.PROD && clearConsole.value) {
    console.clear()
  }
  runtimeError.value = null
  runtimeWarning.value = null

  try {
    const mainFile = store.mainFile

    // compile code to simulated module system
    const modules = compileModulesForPreview(store)
    console.info(
      `[@vue/repl] successfully compiled ${modules.length} module${
        modules.length > 1 ? `s` : ``
      }.`,
    )

    const codeToEval = [
      `window.__modules__ = {};window.__css__ = [];` +
        `if (window.__app__) window.__app__.unmount();` +
        `document.body.innerHTML = '<div id="app"></div>' + \`${previewOptions?.bodyHTML || ''}\``,
      ...modules,
      `document.querySelectorAll('style[css]').forEach(el => el.remove())
        document.head.insertAdjacentHTML('beforeend', window.__css__.map(s => \`<style css>\${s}</style>\`).join('\\n'))`,
    ]

    // if main file is a react file, mount it.
    if (mainFile.endsWith('.tsx') || mainFile.endsWith('.jsx')) {
      codeToEval.push(
        transform(
          `
        import { createRoot } from 'react-dom/client'
        ${previewOptions?.customCode?.importCode || ''}
        const _mount = () => {
          const AppComponent = __modules__["${mainFile}"].default
          const app = window.__app__ = createRoot(document.getElementById('app'))
          ${previewOptions?.customCode?.useCode || ''}
          app.render(<AppComponent />)
        }
        _mount()`,
          {
            transforms: ['jsx', 'typescript'],
            jsxRuntime: 'automatic',
          },
        ).code,
      )
    }

    // eval code in sandbox
    await proxy.eval(codeToEval)
  } catch (e: any) {
    console.error(e)
    runtimeError.value = (e as Error).message
  }
}

/**
 * Reload the preview iframe
 */
function reload() {
  sandbox.contentWindow?.location.reload()
}

defineExpose({ reload })
</script>

<template>
  <div
    v-show="show"
    ref="container"
    class="iframe-container"
    :class="{ [theme]: previewTheme }"
  />
  <Message :err="runtimeError" />
  <Message v-if="!runtimeError" :warn="runtimeWarning" />
</template>

<style scoped>
.iframe-container,
.iframe-container :deep(iframe) {
  width: 100%;
  height: 100%;
  border: none;
  background-color: #fff;
}
.iframe-container.dark :deep(iframe) {
  background-color: #1e1e1e;
}
</style>
