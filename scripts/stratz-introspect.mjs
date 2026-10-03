// Интроспекция типов STRATZ GraphQL (для отладки)
//   node scripts/stratz-introspect.mjs [typeName] [type|mutationRoot]
import fs from 'node:fs'

const key = (fs.readFileSync('.env', 'utf8').match(/^STRATZ_API_KEY=(.*)$/m) ?? [])[1]?.trim()
if (!key) {
  console.error('STRATZ_API_KEY не найден в .env')
  process.exit(1)
}

const typeName = process.argv[2] ?? 'DotaMutation'
const kind = process.argv[3] ?? 'type' // type | mutationRoot
const query =
  kind === 'mutationRoot'
    ? `query { __schema { mutationType { fields { name description args { name defaultValue type { name kind ofType { name kind } } } } } } }`
    : `query { __type(name: "${typeName}") { fields { name description args { name defaultValue type { name kind ofType { name kind } } } } inputFields { name type { name kind ofType { name kind ofType { name } } } } } }`

const res = await fetch('https://api.stratz.com/graphql', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
    'User-Agent': 'STRATZ_API',
  },
  body: JSON.stringify({ query }),
})
const json = await res.json()
if (json.errors) {
  console.error(JSON.stringify(json.errors, null, 2))
  process.exit(1)
}
const t =
  kind === 'mutationRoot'
    ? json.data?.__schema?.mutationType
    : json.data?.__type
if (!t) {
  console.error(`Тип ${typeName} не найден`)
  process.exit(1)
}
console.log(`Поля ${kind === 'mutationRoot' ? 'Mutation (root)' : typeName} (${t.fields.length}):`)
for (const f of t.fields) {
  const args = (f.args ?? [])
    .map((a) => `${a.name}: ${a.type.name ?? a.type.ofType?.name ?? '?'}`)
    .join(', ')
  console.log(` - ${f.name}(${args})${f.description ? `\n     ${f.description}` : ''}`)
}
if (t.inputFields) {
  console.log(`InputFields ${typeName}:`)
  for (const f of t.inputFields) {
    console.log(
      ` - ${f.name}: ${f.type.name ?? f.type.ofType?.name ?? f.type.ofType?.ofType?.name ?? '?'}`,
    )
  }
}
