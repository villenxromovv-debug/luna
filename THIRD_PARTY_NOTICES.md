# Third-Party Notices

Luna itself is licensed under the GNU Affero General Public License, version 3 or later.
See [LICENSE](LICENSE) and [NOTICE](NOTICE). This file records the third-party code and
licenses that ship with it.

## Clip pipeline (MIT)

`luna/clipper/` contains code based on [AI-Youtube-Shorts-Generator](https://github.com/Anil-matcha/AI-Youtube-Shorts-Generator) by Anil Chandra Naidu Matcha. The upstream repository distributes that code under the MIT License. Its copyright and permission notice are preserved in [`luna/clipper/LICENSE`](luna/clipper/LICENSE), and each file in that directory carries an `SPDX-License-Identifier: MIT` header, except `highlights.py`.

Luna contributors have changed this code. They moved it from `AI-Clipper/shorts_generator/` to `luna/clipper/`, removed the MuAPI and CLI backends, and added `subtitles.py`. These changes do not alter the upstream copyright or license, and Luna makes no ownership claim over the upstream code. The MIT copyright notice names the upstream author and has not been edited.

MIT is compatible with the AGPL: the combined work is distributed under AGPL-3.0-or-later while the MIT-licensed component keeps its own terms. Anyone receiving Luna also receives the MIT notice, so the rights MIT grants cannot be withdrawn.

`luna/clipper/highlights.py` is the exception. The upstream copy credited its selection logic to ViralVadoo's `transcript_analysis/highlight_generator.py`, whose license Luna could not confirm, so Luna replaced it with its own implementation, written without reference to that code. The file is Luna original code under AGPL-3.0-or-later and carries that header.

## Luna original code (AGPL-3.0-or-later)

Everything outside `luna/clipper/`, plus `luna/clipper/highlights.py`, is Copyright (C) 2026 Miqdad and licensed under the GNU Affero General Public License, version 3 or later. Source files carry an `SPDX-License-Identifier: AGPL-3.0-or-later` header. The AGPL requires anyone who distributes a modified version, or lets others use one over a network, to offer the corresponding source under the same license.

The license does not grant trademark rights. The Luna name and logo remain with the project and may not be used to promote a modified version or to suggest endorsement.

## Face detection model (MIT)

`luna/assets/models/face_detection_yunet.onnx` is YuNet from [OpenCV Zoo](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet), licensed under the MIT License. The model detects faces for clip framing: a single speaker is followed by the camera, two speakers switch the clip to a blurred-background layout. The file ships unmodified.

## Word-timed captions (MIT)

`luna/clipper/yt_words.py` is adapted from [NeonClipping](https://github.com/iamajmeena/neonclipping) by iamajmeena, licensed under the MIT License. It reads YouTube's json3 caption track to get one timestamp per word, which keeps burned-in captions on the speaker's heels. Luna's copy carries an `SPDX-License-Identifier: MIT` header, and the parsing was changed: typed return values, network failures return `None` instead of raising.

## Dependencies

Dependencies are installed from `requirements.txt` under their own licenses, and Luna does not relicense them. Published Docker images also include FFmpeg and FFprobe from Debian, under FFmpeg's own license terms. The optional local Whisper provider installs `faster-whisper` from `requirements-whisper.txt`, also under its own license.

## UI, agent skills, and frontend libraries

`AGENTS.md` integrates external coding agent skills for UI, copy, accessibility, layout, and comment review, and the browser interface in `luna/templates/` and `luna/assets/ui/` loads third-party frontend packages from public CDNs or adapts external UI interaction patterns. Each component stays under its respective upstream terms.

| Component | Role in Luna | Source |
| --- | --- | --- |
| antislop (`MIT`) | Coding agent rules (`antislop`, `antislop-ui`, `antislop-copywriting`, `antislop-code`) referenced in `AGENTS.md` | `https://github.com/miqdadbadjuber/anti-slop` |
| Tailwind CSS (`cdn.tailwindcss.com`) | Layout and utility styling | `https://cdn.tailwindcss.com` |
| Lucide Icons (`0.469.0`) | Interface icons | `https://unpkg.com/lucide@0.469.0` |
| Google Fonts (`Inter`, `Sora`) | Body and heading typefaces | `https://fonts.googleapis.com` |
| player.style (`sutro`) | Video and audio player web component (`media-theme-sutro`) | `https://cdn.jsdelivr.net/npm/player.style/sutro/+esm` |
| Unicorn Studio (`1.4.30`) | Optional animated WebGL background runtime | `https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v1.4.30/dist/unicornStudio.umd.js` |
| PatternCraft | Optional CSS radial gradient presets for the Studio background selector | `https://patterncraft.store/` |
| Transitions.dev | Reference patterns for sliding tabs, collapsible task rows, shake validation, and clipper tooltips | `https://transitions.dev` |
| coss UI | Reference patterns for primary buttons and stacked toast notifications | `https://coss.com/ui` |

## Icons and media

The platform logos in `luna/assets/` are trademarks of their respective owners (YouTube/Google, Instagram/Meta, TikTok/ByteDance) and are used only to identify the supported services. They are not covered by Luna's license.
