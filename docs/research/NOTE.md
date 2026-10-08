## docs/research placeholder

Task operator menyebut context ada di `docs/research/01..06*.md`, tapi file
itu tidak tersedia di environment Docker ini (workspace scratch, bukan repo
yang di-mount dari host). Adapter dibangun berdasarkan spec di task body
sendiri: Source<T>, systemRun, cache, regex guard, endpoint Elysia.

Bila file 01..06 tersedia di host, salin ke sini dan adopsi constraint
addional yang ada di sana.
