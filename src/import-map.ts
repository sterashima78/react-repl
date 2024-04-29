import { computed } from 'vue'

export function useVueImportMap() {
  const importMap = computed<ImportMap>(() => {
    return {
      imports: {
        react: 'https://esm.sh/react@18.2.0?dev',
        'react/': 'https://esm.sh/*react@18.2.0&dev/',
        'react-dom': 'https://esm.sh/react-dom@18.2.0?external=react&dev',
        'react-dom/': 'https://esm.sh/*react-dom@18.2.0&external=react&dev/',
      },
    }
  })

  return {
    importMap,
  }
}

export interface ImportMap {
  imports?: Record<string, string | undefined>
  scopes?: Record<string, Record<string, string>>
}

export function mergeImportMap(a: ImportMap, b: ImportMap): ImportMap {
  return {
    imports: { ...a.imports, ...b.imports },
    scopes: { ...a.scopes, ...b.scopes },
  }
}
