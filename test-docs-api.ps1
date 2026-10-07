$ErrorActionPreference = 'Stop'
$base = 'http://localhost:3001/api'
$fail = 0
function Check($cond, $msg) { if ($cond) { Write-Host "  OK   $msg" } else { Write-Host "  FALHA $msg"; $script:fail++ } }

Write-Host '=== 1) Criar projeto de teste ==='
$body = @{
    name = 'Projeto Documentos E2E'; description = 'Projeto para validar a geracao de documentos.'
    category = 'data'; priority = 'critical'; status = 'in_progress'
    department = 'Dados'; company = 'H2O Innovation'
    assignee = 'Diego Silva'; requester = 'Maria Souza'
    start_date = '2026-01-15'; end_date = '2026-07-30'; budget = 150000
    github_repo = 'https://github.com/h2o/docs-e2e'
} | ConvertTo-Json
$proj = Invoke-RestMethod -Uri "$base/projects" -Method Post -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
Check ($proj.id -gt 0) "projeto criado id=$($proj.id)"

Write-Host '=== 2) Gerar os 7 tipos ==='
$types = Invoke-RestMethod -Uri "$base/document-types"
$created = @{}
foreach ($t in $types) {
    $b = @{ type_slug = $t.slug; author = 'Teste E2E' } | ConvertTo-Json
    $d = Invoke-RestMethod -Uri "$base/projects/$($proj.id)/documents" -Method Post -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($b))
    $created[$t.slug] = $d
    Check ($d.current_version -eq 1 -and $d.content.Length -gt 500) "$($t.slug): v1, $($d.content.Length) chars"
}
Check ($created.Count -eq 7) "7 documentos gerados"

Write-Host '=== 3) Gerar duplicado deve dar 409 ==='
$dup = 0
try {
    $b = @{ type_slug = 'brief' } | ConvertTo-Json
    Invoke-RestMethod -Uri "$base/projects/$($proj.id)/documents" -Method Post -ContentType 'application/json' -Body $b | Out-Null
} catch { $dup = $_.Exception.Response.StatusCode.value__ }
Check ($dup -eq 409) "duplicado retornou 409 (obtido: $dup)"

Write-Host '=== 4) Tipo invalido deve dar 400 ==='
$inv = 0
try {
    $b = @{ type_slug = 'nao-existe' } | ConvertTo-Json
    Invoke-RestMethod -Uri "$base/projects/$($proj.id)/documents" -Method Post -ContentType 'application/json' -Body $b | Out-Null
} catch { $inv = $_.Exception.Response.StatusCode.value__ }
Check ($inv -eq 400) "tipo invalido retornou 400 (obtido: $inv)"

Write-Host '=== 5) Listar documentos (sem content) ==='
$list = Invoke-RestMethod -Uri "$base/projects/$($proj.id)/documents"
Check (@($list).Count -eq 7) "listou 7 documentos"
Check ($null -eq $list[0].content) "listagem nao traz o conteudo (payload leve)"
Check ($list[0].content_length -gt 500) "content_length presente"

Write-Host '=== 6) Ler documento completo ==='
$docId = $created['cronograma'].id
$full = Invoke-RestMethod -Uri "$base/documents/$docId"
Check ($full.content -match '## 2. Fases') "cronograma contem a secao Fases"
Check ($full.content -match 'Projeto Documentos E2E') "conteudo tem o nome do projeto"
Check ($full.content -match '150\.000,00') "orcamento formatado em BRL"

Write-Host '=== 7) Editar -> nova versao ==='
$edit = @{ title = $full.title; content = $full.content + "`n`n## 7. Nota de teste`n`nEditado pelo teste E2E."; status = 'final'; author = 'Diego' } | ConvertTo-Json
$upd = Invoke-RestMethod -Uri "$base/documents/$docId" -Method Put -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($edit))
Check ($upd.current_version -eq 2) "versao incrementou para 2"
Check ($upd.status -eq 'final') "status salvo como final"

Write-Host '=== 8) Salvar sem alteracao deve dar 400 ==='
$noop = 0
try { Invoke-RestMethod -Uri "$base/documents/$docId" -Method Put -ContentType 'application/json' -Body $edit | Out-Null }
catch { $noop = $_.Exception.Response.StatusCode.value__ }
Check ($noop -eq 400) "salvar sem mudanca retornou 400 (obtido: $noop)"

Write-Host '=== 9) Historico ==='
$vers = Invoke-RestMethod -Uri "$base/documents/$docId/versions"
Check (@($vers).Count -eq 2) "2 versoes no historico"
$v1 = Invoke-RestMethod -Uri "$base/documents/$docId/versions/1"
Check ($v1.content -notmatch 'Nota de teste') "v1 nao tem a edicao do teste"

Write-Host '=== 10) Restaurar v1 -> v3 ==='
$rest = Invoke-RestMethod -Uri "$base/documents/$docId/restore/1" -Method Post -ContentType 'application/json' -Body '{}'
Check ($rest.current_version -eq 3) "restaurado como v3"
Check ($rest.restored_from -eq 1) "campo restored_from = 1"
Check ($rest.content -notmatch 'Nota de teste') "conteudo voltou ao da v1"

Write-Host '=== 11) Regerar -> v4 ==='
$regen = Invoke-RestMethod -Uri "$base/documents/$docId/regenerate" -Method Post -ContentType 'application/json' -Body '{}'
Check ($regen.current_version -eq 4) "regerado como v4"
Check ($regen.content -match '## 1. Resumo') "conteudo do template restaurado"

Write-Host '=== 12) Exportar .md ==='
$md = Invoke-WebRequest -Uri "$base/documents/$docId/export?format=md" -UseBasicParsing
Check ($md.StatusCode -eq 200) "md HTTP 200"
Check ($md.Headers['Content-Type'] -match 'text/markdown') "content-type markdown"
Check ($md.Headers['Content-Disposition'] -match 'attachment') "content-disposition attachment"
Check ($md.Content -match '^# Cronograma') "md comeca com o H1"

Write-Host '=== 13) Exportar .doc (Word) ==='
$doc = Invoke-WebRequest -Uri "$base/documents/$docId/export?format=doc" -UseBasicParsing
# PowerShell trata application/msword como binario: .Content vem em bytes
$docHtml = [System.Text.Encoding]::UTF8.GetString($doc.Content)
Check ($doc.StatusCode -eq 200) "doc HTTP 200"
Check ($doc.Headers['Content-Type'] -match 'msword') "content-type msword"
Check ($docHtml -match '<table>') "doc contem tabela HTML renderizada"
Check ($docHtml -match '<h2>') "doc contem titulos convertidos"
Check ($docHtml -match 'Projeto Documentos E2E') "doc contem o nome do projeto"
Check ($docHtml -match 'doc-footer') "doc contem rodape"
Check ($docHtml -notmatch '\| --- \|') "sem separador de tabela cru no doc"
Check ($docHtml -notmatch '## ') "sem heading markdown cru no doc"

Write-Host '=== 14) Formato invalido ==='
$bad = 0
try { Invoke-WebRequest -Uri "$base/documents/$docId/export?format=xlsx" -UseBasicParsing | Out-Null }
catch { $bad = $_.Exception.Response.StatusCode.value__ }
Check ($bad -eq 400) "formato invalido retornou 400 (obtido: $bad)"

Write-Host '=== 15) Contagem de documentos na listagem de projetos ==='
$projs = Invoke-RestMethod -Uri "$base/projects?search=Documentos E2E"
Check ($projs[0].document_count -eq 7) "document_count = 7 na listagem"

Write-Host '=== 16) Excluir um documento ==='
Invoke-RestMethod -Uri "$base/documents/$($created['plano-testes'].id)" -Method Delete | Out-Null
$after = Invoke-RestMethod -Uri "$base/projects/$($proj.id)/documents"
Check (@($after).Count -eq 6) "6 documentos restantes"

Write-Host '=== 17) Cascade ao excluir o projeto ==='
docker exec gantt-db psql -U gantt -d gantt_2026 -t -c "SELECT COUNT(*) FROM project_documents WHERE project_id = $($proj.id);" | Out-Null
$beforeDocs = (docker exec gantt-db psql -U gantt -d gantt_2026 -t -c "SELECT COUNT(*) FROM project_documents WHERE project_id = $($proj.id);").Trim()
Invoke-RestMethod -Uri "$base/projects/$($proj.id)" -Method Delete | Out-Null
$afterDocs = (docker exec gantt-db psql -U gantt -d gantt_2026 -t -c "SELECT COUNT(*) FROM project_documents WHERE project_id = $($proj.id);").Trim()
$afterVers = (docker exec gantt-db psql -U gantt -d gantt_2026 -t -c "SELECT COUNT(*) FROM project_document_versions v JOIN project_documents d ON d.id = v.document_id WHERE d.project_id = $($proj.id);").Trim()
Check ($beforeDocs -eq 6) "antes: 6 documentos ($beforeDocs)"
Check ($afterDocs -eq 0) "depois: 0 documentos (cascade)"
Check ($afterVers -eq 0) "depois: 0 versoes (cascade)"

Write-Host '=== 18) Estado final do banco ==='
docker exec gantt-db psql -U gantt -d gantt_2026 -c "SELECT (SELECT COUNT(*) FROM projects) AS projetos, (SELECT COUNT(*) FROM project_documents) AS docs, (SELECT COUNT(*) FROM project_document_versions) AS versoes;"

Write-Host ''
if ($fail -eq 0) { Write-Host '=== TODOS OS TESTES PASSARAM ===' } else { Write-Host "=== $fail FALHA(S) ===" }
exit $fail
