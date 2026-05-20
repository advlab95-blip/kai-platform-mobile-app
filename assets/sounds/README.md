# Sound Assets

Place these 5 MP3 files in this directory. The app will silently skip any that are missing.

| File | Purpose | Recommended length |
|---|---|---|
| `click.mp3` | Button tap | < 150ms |
| `success.mp3` | Save / submit success | < 400ms |
| `error.mp3` | Error alert | < 400ms |
| `whoosh.mp3` | Navigate / send message | < 300ms |
| `notification.mp3` | Incoming push notification | < 800ms |

## Free sources
- https://pixabay.com/sound-effects/
- https://mixkit.co/free-sound-effects/

## Tips
- Keep each file under 50KB to minimize bundle size.
- Use a quiet volume (the code already attenuates to 0.5).
- Match the app's "premium" feel — avoid harsh beeps; prefer soft chimes and taps.
