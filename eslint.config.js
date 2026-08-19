import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'

export default defineConfigWithVueTs(
  { ignores: ['dist/**', 'src-tauri/target/**'] },
  js.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
  skipFormatting,
)
