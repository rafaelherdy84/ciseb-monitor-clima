export interface MapImageResult {
  dataUrl: string;
  blob: Blob;
}

const LEGEND_ITEMS = [
  { label: 'Calor Extremo / Queimada', color: '#DC2626' },
  { label: 'Calor Intenso / Seca', color: '#F97316' },
  { label: 'Chuva Moderada / Frio', color: '#38BDF8' },
  { label: 'Chuva Intensa / Enchente', color: '#1D4ED8' },
];

export async function exportParaMapToPng(
  svgId = 'para-risk-map-svg',
  footerTitle = 'SEDUC-PA · Defesa Civil Escolar · Mapa de Risco (144 Municípios)'
): Promise<MapImageResult | null> {
  const svgEl = document.getElementById(svgId);
  if (!svgEl) return null;

  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', '760');
  clone.setAttribute('height', '560');

  const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bgRect.setAttribute('x', '0');
  bgRect.setAttribute('y', '0');
  bgRect.setAttribute('width', '760');
  bgRect.setAttribute('height', '560');
  bgRect.setAttribute('fill', '#FFFFFF');
  clone.insertBefore(bgRect, clone.firstChild);

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(clone);
  const svgBlob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>${svgString}`], {
    type: 'image/svg+xml;charset=utf-8',
  });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = (err) => reject(err);
      image.src = url;
    });

    const scale = 1.5;
    const mapW = 760 * scale;
    const mapH = 560 * scale;
    const footerH = 72;

    const canvas = document.createElement('canvas');
    canvas.width = mapW;
    canvas.height = mapH + footerH;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // White background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw map
    ctx.drawImage(img, 0, 0, mapW, mapH);

    // Footer divider
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(28, mapH);
    ctx.lineTo(mapW - 28, mapH);
    ctx.stroke();

    // Footer title
    ctx.fillStyle = '#0F172A';
    ctx.font = '600 15px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(footerTitle, 28, mapH + 26);

    // Footer 4-color legend
    let cursorX = 28;
    const legendY = mapH + 52;
    ctx.font = '500 13px "Plus Jakarta Sans", sans-serif';
    for (const item of LEGEND_ITEMS) {
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.arc(cursorX + 6, legendY - 4, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#334155';
      ctx.fillText(item.label, cursorX + 18, legendY);
      cursorX += ctx.measureText(item.label).width + 42;
    }

    const dataUrl = canvas.toDataURL('image/png');
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png')
    );

    if (!blob) return null;
    return { dataUrl, blob };
  } finally {
    URL.revokeObjectURL(url);
  }
}
