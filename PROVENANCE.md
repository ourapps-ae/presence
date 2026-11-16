# Package provenance

Wrapper licence: `Apache-2.0`. `LICENCE` and `NOTICE` are supplied wrapper documents; `SOURCE.md` identifies the Level N source.

`component.json` records each external source version, revision, repository, package URL, supplied notice documents and delivery inventory or dependency lock.

npm dependencies use package-lock version 3 with the exact package path, version and integrity. Native dependencies use Swift resolved format 3 or Gradle configuration locks and SHA-256 verification records.

Notice documents retain supplied bytes. A package.json or Maven project document with a licence field is a declaration; it does not supply additional licence text. Snapshot versions identify bundled source bytes rather than an upstream release tag.

Shared dependency pins describe one application dependency installation; isolated pins belong to separate build or verification projects. Apple system frameworks follow the declared operating-system ranges.

Stylesheet namespaces name the actual selector and property separated by `::`, plus global keyframe names. Global theme variables are intentional application-wide declarations.

Windows browser modules run inside the Electron host. Apple modules target iOS, television and Mac Catalyst where declared. Runtime execution coverage is recorded in signed review evidence.

Maintainer: Level N Ltd. Contact: https://github.com/ourapps-ae/presence/issues.
