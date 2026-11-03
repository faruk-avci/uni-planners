// Saves the JSON the content script built. Service workers have no
// URL.createObjectURL, so the file goes out as a data: URL.
//
// Chrome sometimes drops the `filename` given to downloads.download (data:
// URLs, or another extension that renames downloads) and saves "download.json".
// So the name is suggested again when Chrome determines it, and the final path
// is reported back so the panel can show what really happened.
const pending = new Map() // data: URL -> wanted filename

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  const filename = item.byExtensionId === chrome.runtime.id ? pending.get(item.url) : null
  if (!filename) {
    suggest()
    return
  }
  pending.delete(item.url)
  suggest({ filename, conflictAction: 'overwrite' })
})

function waitUntilDone(id) {
  return new Promise(resolve => {
    const check = () => chrome.downloads.search({ id }, ([item]) => {
      if (!item || item.state === 'interrupted') {
        chrome.downloads.onChanged.removeListener(onChanged)
        resolve({ ok: false, error: item?.error || 'download interrupted' })
      } else if (item.state === 'complete') {
        chrome.downloads.onChanged.removeListener(onChanged)
        resolve({ ok: true, path: item.filename })
      }
    })
    const onChanged = delta => { if (delta.id === id && delta.state) check() }
    chrome.downloads.onChanged.addListener(onChanged)
    check()
  })
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'download') return false
  const url = 'data:application/json;charset=utf-8,' + encodeURIComponent(message.content)
  pending.set(url, message.filename)
  chrome.downloads.download({ url, filename: message.filename, conflictAction: 'overwrite', saveAs: false }, async id => {
    if (!id) {
      pending.delete(url)
      sendResponse({ ok: false, error: chrome.runtime.lastError?.message || 'download failed' })
      return
    }
    sendResponse(await waitUntilDone(id))
  })
  return true
})
