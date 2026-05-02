chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'slashfill-save',
      title: 'Save as SlashFill command',
      contexts: ['selection'],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'slashfill-save') return;
  const selected = info.selectionText?.trim();
  if (!selected || !tab?.id) return;

  chrome.tabs.sendMessage(tab.id, { type: 'slashfill-save', value: selected });
});
