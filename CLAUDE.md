# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ToolTorrent Extractor** is a Chrome extension (Manifest V3) that extracts torrent metadata (images, description, tags) from torrent tracker pages and downloads them as organized files. It targets Gazelle/UNIT3D-based trackers, starting with `bj-share.info`, with user-configurable domain support.

## Architecture

- **manifest.json** — Manifest V3 config. Permissions: `activeTab`, `downloads`. Content script injected on matched domains.
- **content.js** — Main content script injected into torrent pages. Handles all DOM extraction, UI rendering (FAB + modal/sidebar), image selection, and download orchestration via `chrome.downloads`.
- **styles.css** — Dark-themed UI styles for the FAB button, modal, image grid, and controls.
- **icons/** — Extension icons (128x128).

There is no background service worker beyond the minimal required by Manifest V3. All logic lives in the content script.

## Key Design Decisions

- **Domain restriction**: The extension only activates on configured domains (defined in `manifest.json` content_scripts matches). Additional domains can be added by the user.
- **DOM selectors** target Gazelle/UNIT3D page structure:
  - Title: `#torrent_details > h1`
  - Detail table: `.torrent_detail_table tr`
  - Description: `.torrent_description` or `#description`
  - Images: `img` inside description, `.torrent_image`, `.cover`
  - Tags: `.box_tags`
- **Comments are explicitly excluded** from all extraction.
- **Downloads** use `chrome.downloads` API with configurable `saveAs` mode (automatic vs. prompt).

## Download Behavior

- Images are downloaded with original filenames when possible, deduplicated.
- A `.txt` file is generated with the torrent title as filename, containing: title, URL, category, table info, tags, full description, and image links.
- Relative URLs must be resolved to absolute before downloading.
- Downloads are async-controlled to handle large batches without failures.

## Development

No build step required. Load as unpacked extension in `chrome://extensions/` with Developer Mode enabled. Reload the extension after any file change.
