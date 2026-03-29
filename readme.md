# ToolTorrent Extractor

Extensão para Google Chrome (Manifest V3) que extrai imagens, metadados e
descrição de páginas de torrent (trackers Gazelle / UNIT3D) e baixa tudo de
forma organizada com um único clique.

## Instalação

1. Abra `chrome://extensions/`
2. Ative **Modo do desenvolvedor** (canto superior direito)
3. Clique em **Carregar sem compactação**
4. Selecione a pasta `ToolTorrent Extractor`
5. A extensão estará ativa imediatamente

## Como usar

1. Acesse a página de um torrent em qualquer domínio suportado
2. Um botão circular vermelho (FAB) aparecerá no canto superior direito
3. Clique no botão para abrir o painel
4. Selecione as imagens desejadas (todas vêm marcadas por padrão)
5. Revise os dados na caixa de texto (editável antes de baixar)
6. Clique em **Baixar Selecionados**

Os arquivos serão salvos em:

```
Downloads/ToolTorrent/<Titulo do Torrent>/
  ├── <Titulo do Torrent>.txt   ← metadados formatados
  ├── capa.jpg
  ├── screenshot1.png
  └── ...
```

## O que é baixado

- **Arquivo `.txt`** com: título, URL, categoria, tabela de detalhes, tags,
  descrição completa e lista de links de imagens
- **Todas as imagens selecionadas** (capa, screenshots, imagens da descrição)
- Imagens de comentários são **ignoradas** automaticamente
- Nomes de arquivo originais são preservados; duplicatas recebem sufixo `_2`, `_3`...

## Dominios suportados

- `https://bj-share.info/torrents.php*`
- `https://bj-share.me/torrents.php*`
- `https://tracker.shakaw.com.br/torrent.php*`
- `https://cliente.amigos-share.club/torrents-details.php*`
- `https://exoticaz.to/torrent/*`
- `https://animez.to/torrents/*`

Para adicionar um novo domínio, edite o array `matches` em `manifest.json`
e recarregue a extensão em `chrome://extensions/`.

## Configuração

Edite o objeto `CONFIG` no topo de `content.js`:

| Variavel | Padrao | Descricao |
|---|---|---|
| `SAVE_AS` | `false` | `false` = pasta padrão de downloads; `true` = pergunta onde salvar |
| `DOWNLOAD_CONCURRENCY` | `3` | Downloads simultâneos de imagem |
| `SUBFOLDER_PREFIX` | `'ToolTorrent'` | Nome da pasta pai nos downloads |

## Estrutura de arquivos

| Arquivo | Descricao |
|---|---|
| `manifest.json` | Configuração da extensão (permissões, domínios) |
| `content.js` | Extração de dados, interface e orquestração de downloads |
| `background.js` | Service worker mínimo — apenas aciona `chrome.downloads` |
| `styles.css` | Interface dark mode (FAB, modal, grid de imagens) |
| `icons/` | Ícone da extensão |

## Permissoes utilizadas

| Permissao | Motivo |
|---|---|
| `downloads` | Salvar arquivos via `chrome.downloads` API |
| `activeTab` | Acesso à aba ativa (não coleta dados em segundo plano) |
