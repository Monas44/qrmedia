// Crawlers, geradores de preview de links e clientes HTTP automatizados.
// Previews de mensageiros são o caso mais comum: o link é "aberto" pelo servidor
// do WhatsApp/Telegram/Slack assim que alguém o cola numa conversa.
const BOT_UA_RE = new RegExp(
  [
    'bot\\b', 'bot/', 'crawler', 'spider', 'crawl', 'slurp', 'scraper', 'preview',
    'whatsapp', 'facebookexternalhit', 'facebookcatalog', 'meta-externalagent',
    'telegrambot', 'slackbot', 'slack-imgproxy', 'discordbot', 'twitterbot',
    'linkedinbot', 'skypeuripreview', 'microsoftpreview', 'redditbot', 'applebot', 'googlebot', 'google-inspectiontool', 'googleother',
    'adsbot-google', 'mediapartners-google', 'feedfetcher', 'bingbot', 'bingpreview',
    'yandex', 'baiduspider', 'duckduckbot', 'petalbot', 'semrush', 'ahrefs', 'mj12bot',
    'dotbot', 'embedly', 'quora link preview', 'outbrain', 'vkshare', 'w3c_validator',
    'iframely', 'kakaotalk-scrap', 'zoominfobot',
    'headlesschrome', 'phantomjs', 'puppeteer', 'playwright', 'selenium', 'lighthouse',
    'curl/', 'wget/', 'python-requests', 'python-urllib', 'aiohttp', 'httpx', 'go-http-client',
    'okhttp', 'java/', 'apache-httpclient', 'node-fetch', 'axios/', 'undici', 'libwww-perl',
    'postmanruntime', 'insomnia', 'uptimerobot', 'pingdom', 'statuscake',
    'chatgpt-user', 'gptbot', 'claudebot', 'perplexitybot', 'bytespider', 'ccbot',
  ].join('|'),
  'i',
);

export function isBot(userAgent: string | null | undefined): boolean {
  const ua = userAgent?.trim();
  if (!ua || ua.length < 10) return true; // navegadores reais sempre mandam UA
  return BOT_UA_RE.test(ua);
}
