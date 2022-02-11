const apiKeys = `CREATE TABLE keys (
    key TEXT NOT NULL UNIQUE,
    qouta INTEGER NOT NULL,
    usage INTEGER NOT NULL
    );`

export default {
    apiKeys: apiKeys
}