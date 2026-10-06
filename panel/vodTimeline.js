(() => {
  const dayEnd = (timestamp) => {
    const date = new Date(timestamp);
    date.setDate(date.getDate() + 1);
    return date.getTime();
  };
  const interval = (video, start, end) => {
    const from = Date.parse(video.createdAt);
    const duration = Number(video.lengthSeconds) * 1000;
    const to = from + duration;
    if (!Number.isFinite(from) || !Number.isFinite(to) || duration <= 0 || from >= end || to <= start) return null;
    return { video, from, to, left: 100 * (Math.max(start, from) - start) / (end - start),
      width: 100 * (Math.min(end, to) - Math.max(start, from)) / (end - start) };
  };
  const layout = (videos, start, end = dayEnd(start)) => {
    const lanes = [];
    return videos.map((video) => interval(video, start, end)).filter(Boolean)
      .sort((a, b) => a.from - b.from).map((item) => {
        let lane = lanes.findIndex((until) => until <= item.from);
        if (lane < 0) lane = lanes.length;
        lanes[lane] = item.to;
        return { ...item, lane };
      });
  };
  const visibleRange = (rows, start, fullDay = false) => {
    const end = dayEnd(start), hour = 3600000;
    const bands = rows.flatMap(row => row.videos.map(video => interval(video, start, end)).filter(Boolean));
    if (fullDay || !bands.length) return { start, end };
    const first = Math.min(...bands.map(b => Math.max(start, b.from)));
    const last = Math.max(...bands.map(b => Math.min(end, b.to)));
    return { start: Math.max(start, start + Math.floor((first - start) / hour) * hour - hour / 2),
      end: Math.min(end, start + Math.ceil((last - start) / hour) * hour + hour / 2) };
  };
  const offsetAt = (video, time) => Math.max(0, Math.min(Math.max(0, Number(video.lengthSeconds) - 1), Math.floor((time - Date.parse(video.createdAt)) / 1000)));
  const playbackUrl = (video, time) => /^\d+$/.test(String(video.id)) ? `https://www.twitch.tv/videos/${video.id}?t=${offsetAt(video, time)}s` : null;
  const periodRange = (day, days = 1) => {
    const date = new Date(day);
    date.setDate(date.getDate() - Math.max(0, days - 1));
    return { start: date.getTime(), end: dayEnd(day) };
  };
  const render = (host, rows, day, { locale, onSelect, formatDuration, selectedId, zoom = 1, fullDay = false, days = 1 }) => {
    host.replaceChildren();
    const { start, end } = days > 1 ? periodRange(day, days) : visibleRange(rows, day, fullDay);
    const chart = document.createElement('div');
    chart.className = 'tfr-vod-chart';
    chart.style.minWidth = `${Math.round(Math.max(900, 160 + days * 110) * zoom)}px`;
    const step = days > 1 ? 86400000 : (end - start) / zoom <= 6 * 3600000 ? 1800000 : 7200000;
    chart.style.setProperty('--hour-step', `${100 * step / (end - start)}%`);
    const axis = document.createElement('div');
    axis.className = 'tfr-vod-chart__axis';
    for (let time = start; time < end; time = days > 1 ? dayEnd(time) : time + step) {
      const tick = document.createElement('span');
      tick.style.left = `${100 * (time - start) / (end - start)}%`;
      tick.textContent = days > 1 ? new Date(time).toLocaleDateString(locale, { day: 'numeric', month: 'short' }) : new Date(time).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
      axis.appendChild(tick);
    }
    chart.appendChild(axis);
    const cursor = document.createElement('div');
    cursor.className = 'tfr-vod-chart__cursor'; cursor.hidden = true;
    const cursorTime = document.createElement('span'); cursor.appendChild(cursorTime);
    const selection = document.createElement('div');
    selection.className = 'tfr-vod-selection'; selection.hidden = true;
    selection.setAttribute('aria-live', 'polite');
    let pinned = false;
    let pinnedTime = null;
    const clock = time => new Date(time).toLocaleString(locale, { ...(days > 1 ? { day: 'numeric', month: 'short' } : {}), hour: '2-digit', minute: '2-digit' });
    const showCursor = (time, track) => {
      cursor.style.left = `${track.offsetLeft + Math.max(0, Math.min(1, (time - start) / (end - start))) * track.clientWidth}px`;
      cursorTime.textContent = clock(time); cursor.hidden = false;
    };
    rows.forEach((channel) => {
      const bands = layout(channel.videos, start, end);
      const row = document.createElement('div');
      row.className = 'tfr-vod-chart__row';
      if (/^#[\da-f]{6}$/i.test(channel.color || '')) row.style.setProperty('--vod-group-color', channel.color);
      const label = document.createElement('strong');
      label.className = 'tfr-vod-chart__name';
      label.textContent = channel.displayName || channel.login;
      label.title = label.textContent;
      const track = document.createElement('div');
      track.className = 'tfr-vod-chart__track';
      const timeAt = event => {
        const rect = track.getBoundingClientRect();
        return start + Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * (end - start);
      };
      track.addEventListener('pointermove', event => { if (!pinned) showCursor(timeAt(event), track); });
      track.style.height = `${Math.max(1, ...bands.map((band) => band.lane + 1)) * 34 + 8}px`;
      bands.forEach((band) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tfr-vod-chart__bar';
        button.classList.toggle('is-selected', selectedId === band.video.id);
        button.style.left = `${band.left}%`;
        button.style.width = `${band.width}%`;
        button.style.top = `${band.lane * 34 + 4}px`;
        button.textContent = band.video.title;
        button.title = `${label.textContent} · ${band.video.title}\n${new Date(band.from).toLocaleString(locale)} → ${new Date(band.to).toLocaleString(locale)}\n${formatDuration(band.video.lengthSeconds)}`;
        button.setAttribute('aria-label', button.title);
        button.addEventListener('click', event => {
          const candidate = pinned && pinnedTime >= band.from && pinnedTime < band.to
            ? pinnedTime : event?.detail ? timeAt(event) : Math.max(start, band.from);
          const time = Math.max(band.from, Math.min(band.to - 1, candidate));
          pinnedTime = time;
          pinned = true; showCursor(time, track); selection.replaceChildren(); selection.hidden = false;
          const heading = document.createElement('strong');
          heading.textContent = `${label.textContent} · ${clock(time)} → ${formatDuration(offsetAt(band.video, time))}`;
          selection.appendChild(heading);
          const fr = locale.startsWith('fr');
          const url = playbackUrl(band.video, time);
          if (url) {
            const link = document.createElement('a'); link.className = 'tfr-vods-button';
            link.textContent = fr ? 'Lire ici' : 'Play here'; link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; selection.appendChild(link);
          }
          const details = document.createElement('button'); details.type = 'button'; details.className = 'tfr-vods-button';
          details.textContent = fr ? 'Détails et clips' : 'Details and clips';
          details.addEventListener('click', () => onSelect(channel, band.video)); selection.appendChild(details);
          const release = document.createElement('button'); release.type = 'button'; release.className = 'tfr-vods-button';
          release.textContent = fr ? 'Libérer le curseur' : 'Release cursor';
          release.addEventListener('click', () => { pinned = false; cursor.hidden = true; selection.hidden = true; }); selection.appendChild(release);
        });
        track.appendChild(button);
      });
      row.append(label, track);
      chart.appendChild(row);
    });
    chart.addEventListener('pointerleave', () => { if (!pinned) cursor.hidden = true; });
    chart.appendChild(cursor);
    host.append(chart, selection);
  };
  globalThis.TFRVodTimeline = Object.freeze({ dayEnd, interval, layout, visibleRange, periodRange, offsetAt, playbackUrl, render });
})();
