function isOpen(bot, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: bot.timeZone || 'America/Mexico_City',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (k) => parts.find((p) => p.type === k)?.value;
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')),
    time = get('hour') + ':' + get('minute');
  const inHours =
    bot.opens <= bot.closes
      ? time >= bot.opens && time < bot.closes
      : time >= bot.opens || time < bot.closes;
  return bot.enabled && !bot.closedDays.includes(day) && inHours;
}
module.exports = { isOpen };
