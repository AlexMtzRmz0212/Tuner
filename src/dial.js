const TAU = Math.PI * 2;

export function createDial(canvas) {
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) throw new Error("No se pudo iniciar el indicador gráfico.");
  let width = 600;
  let height = 370;
  let pixelRatio = 1;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    width = 600;
    height = 370;
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  function draw(cents = 0, active = false, inTune = false) {
    const ctx = context;
    ctx.clearRect(0, 0, width, height);
    const cx = width / 2;
    const cy = 304;
    const radius = 230;
    const halfSpread = Math.PI * 0.59;
    const centerAngle = -Math.PI / 2;
    const startAngle = centerAngle - halfSpread;
    const endAngle = centerAngle + halfSpread;
    const range = 50;

    const angleFor = (value) => centerAngle + (Math.max(-range, Math.min(range, value)) / range) * halfSpread;

    // The ivory instrument face carries the original analog-tuner character.
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = "#e4dac6";
    ctx.fill();

    // Narrow, in-tune target band.
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, angleFor(-5), angleFor(5));
    ctx.closePath();
    ctx.fillStyle = "rgba(142, 183, 155, 0.12)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.strokeStyle = "#5d5549";
    ctx.lineWidth = 1;
    ctx.stroke();

    for (let value = -50; value <= 50; value += 2) {
      const angle = angleFor(value);
      const major = value % 10 === 0;
      const medium = value % 5 === 0;
      const inner = radius - (major ? 22 : medium ? 13 : 7);
      ctx.beginPath();
      ctx.moveTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
      ctx.lineTo(cx + inner * Math.cos(angle), cy + inner * Math.sin(angle));
      ctx.strokeStyle = value === 0 ? "#46755c" : major ? "#665d50" : "#9b9283";
      ctx.lineWidth = major ? 1.7 : medium ? 1.15 : 0.8;
      ctx.stroke();
      if (major) {
        const textRadius = Math.abs(value) === 50 ? radius - 55 : radius - 41;
        ctx.fillStyle = "#554d42";
        ctx.font = '12px "Inter", "Segoe UI", sans-serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(value > 0 ? `+${value}` : String(value), cx + textRadius * Math.cos(angle), cy + textRadius * Math.sin(angle));
      }
    }

    ctx.fillStyle = "#6a6154";
    ctx.font = '12px "Inter", "Segoe UI", sans-serif';
    ctx.textAlign = "center";

    const needleAngle = angleFor(active ? cents : 0);
    const needleLength = radius - 28;
    const needleColor = !active ? "#837b70" : inTune ? "#46755c" : "#9d6c2e";
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(needleAngle + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(-2, 0);
    ctx.lineTo(2, 0);
    ctx.lineTo(0.8, -needleLength);
    ctx.lineTo(-0.8, -needleLength);
    ctx.closePath();
    ctx.fillStyle = needleColor;
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, TAU);
    ctx.fillStyle = "#c9a16a";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, TAU);
    ctx.fillStyle = "#29251f";
    ctx.fill();

    // Dial's centered index is a calm, distinct reference mark.
    ctx.fillStyle = "#8eb79b";
    ctx.beginPath();
    ctx.arc(cx, cy - radius - 3, 2.5, 0, TAU);
    ctx.fill();
  }

  return { draw, resize };
}
