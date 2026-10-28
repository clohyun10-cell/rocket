/**
 * Interactive Real-time Canvas Chart Engine
 * 인터넷 연결 없이도 로컬에서 100% 독립 구동되는 고성능 물리 분석 차트
 * 1. 에너지 그래프: 운동에너지(Ek), 위치에너지(Ep), 역학적에너지(Em)
 * 2. 운동역학 그래프: 고도(h), 속력(v), 추력(F), 내부압력(P)
 */

class PhysicsChart {
    constructor(canvasId, options = {}) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.options = Object.assign({
            title: '',
            xLabel: '시간 t (s)',
            yLabel: '값',
            datasets: [],
            showLegend: true
        }, options);

        this.data = [];
        this.currentTime = 0;
        this.hoverIndex = -1;

        this.initEvents();
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        if (!this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.scale(dpr, dpr);
        this.width = rect.width;
        this.height = rect.height;
        this.render();
    }

    initEvents() {
        if (!this.canvas) return;
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            this.handleHover(mouseX);
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.hoverIndex = -1;
            this.render();
        });
    }

    setData(trajectoryData) {
        this.data = trajectoryData || [];
        this.currentTime = 0;
        this.hoverIndex = -1;
        this.render();
    }

    setCurrentTime(t) {
        this.currentTime = t;
        this.render();
    }

    handleHover(mouseX) {
        if (!this.data || this.data.length === 0) return;
        const padLeft = 55;
        const padRight = 20;
        const plotWidth = this.width - padLeft - padRight;
        if (mouseX < padLeft || mouseX > this.width - padRight) {
            this.hoverIndex = -1;
            this.render();
            return;
        }

        const maxT = this.data[this.data.length - 1].t || 1;
        const targetT = ((mouseX - padLeft) / plotWidth) * maxT;

        // 가장 가까운 인덱스 탐색
        let closestIdx = 0;
        let minDiff = Infinity;
        for (let i = 0; i < this.data.length; i++) {
            const diff = Math.abs(this.data[i].t - targetT);
            if (diff < minDiff) {
                minDiff = diff;
                closestIdx = i;
            }
        }
        this.hoverIndex = closestIdx;
        this.render();
    }

    render() {
        if (!this.ctx || !this.width || !this.height) return;
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;

        ctx.clearRect(0, 0, w, h);

        const padLeft = 60;
        const padRight = 25;
        const padTop = 32;
        const padBottom = 35;
        const plotWidth = Math.max(10, w - padLeft - padRight);
        const plotHeight = Math.max(10, h - padTop - padBottom);

        // 차트 배경
        ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
        ctx.fillRect(padLeft, padTop, plotWidth, plotHeight);

        // 타이틀
        ctx.fillStyle = '#94a3b8';
        ctx.font = '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(this.options.title, padLeft, 18);

        if (!this.data || this.data.length === 0) {
            ctx.fillStyle = '#64748b';
            ctx.textAlign = 'center';
            ctx.font = '13px sans-serif';
            ctx.fillText('발사 대기 중 - 발사 버튼을 누르면 그래프가 그려집니다', w / 2, h / 2);
            return;
        }

        // 축 스케일 산출
        const maxT = Math.max(0.1, this.data[this.data.length - 1].t);
        let maxY = 10;
        let minY = 0;

        for (const ds of this.options.datasets) {
            for (const pt of this.data) {
                const val = pt[ds.key] ?? 0;
                if (val > maxY) maxY = val;
                if (val < minY) minY = val;
            }
        }
        // 여유 버퍼 10%
        maxY = maxY * 1.15;
        if (minY < 0) minY = minY * 1.15;

        const getYPixel = (val) => {
            const ratio = (val - minY) / (maxY - minY || 1);
            return padTop + plotHeight - ratio * plotHeight;
        };

        const getXPixel = (t) => {
            const ratio = t / maxT;
            return padLeft + ratio * plotWidth;
        };

        // 그리드 라인 & Y축 눈금
        const ySteps = 4;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
        ctx.lineWidth = 1;
        ctx.fillStyle = '#64748b';
        ctx.font = '10px monospace';
        ctx.textAlign = 'right';

        for (let i = 0; i <= ySteps; i++) {
            const val = minY + (maxY - minY) * (i / ySteps);
            const y = padTop + plotHeight - (i / ySteps) * plotHeight;
            ctx.beginPath();
            ctx.moveTo(padLeft, y);
            ctx.lineTo(padLeft + plotWidth, y);
            ctx.stroke();

            ctx.fillText(val >= 1000 ? (val / 1000).toFixed(1) + 'k' : val.toFixed(val < 10 ? 1 : 0), padLeft - 6, y + 3);
        }

        // X축 시간 눈금
        const xSteps = 5;
        ctx.textAlign = 'center';
        for (let i = 0; i <= xSteps; i++) {
            const tVal = (maxT * i) / xSteps;
            const x = padLeft + (i / xSteps) * plotWidth;
            ctx.beginPath();
            ctx.moveTo(x, padTop + plotHeight);
            ctx.lineTo(x, padTop + plotHeight + 4);
            ctx.stroke();

            ctx.fillText(tVal.toFixed(1) + 's', x, padTop + plotHeight + 16);
        }

        // 축 테두리
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.strokeRect(padLeft, padTop, plotWidth, plotHeight);

        // 데이터셋 라인 그리기
        for (const ds of this.options.datasets) {
            ctx.strokeStyle = ds.color || '#38bdf8';
            ctx.lineWidth = ds.lineWidth || 2;
            ctx.beginPath();

            for (let i = 0; i < this.data.length; i++) {
                const pt = this.data[i];
                const x = getXPixel(pt.t);
                const y = getYPixel(pt[ds.key] ?? 0);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();

            // 영역 채우기 (선택 옵션)
            if (ds.fill) {
                ctx.save();
                ctx.lineTo(getXPixel(this.data[this.data.length - 1].t), getYPixel(0));
                ctx.lineTo(getXPixel(this.data[0].t), getYPixel(0));
                ctx.closePath();
                ctx.fillStyle = ds.fillColor || 'rgba(56, 189, 248, 0.1)';
                ctx.fill();
                ctx.restore();
            }
        }

        // 현재 애니메이션 재생 시간 지시선 (붉은색/노란색 수직선)
        if (this.currentTime >= 0 && this.currentTime <= maxT) {
            const currX = getXPixel(this.currentTime);
            ctx.save();
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(currX, padTop);
            ctx.lineTo(currX, padTop + plotHeight);
            ctx.stroke();
            ctx.restore();
        }

        // 마우스 호버 표시선 및 툴팁
        const activeIdx = this.hoverIndex >= 0 ? this.hoverIndex : null;
        if (activeIdx !== null && this.data[activeIdx]) {
            const pt = this.data[activeIdx];
            const hoverX = getXPixel(pt.t);

            ctx.save();
            ctx.strokeStyle = '#e2e8f0';
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.moveTo(hoverX, padTop);
            ctx.lineTo(hoverX, padTop + plotHeight);
            ctx.stroke();
            ctx.restore();

            // 각 데이터셋 점 표시
            for (const ds of this.options.datasets) {
                const hoverY = getYPixel(pt[ds.key] ?? 0);
                ctx.fillStyle = ds.color || '#38bdf8';
                ctx.beginPath();
                ctx.arc(hoverX, hoverY, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#0f172a';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }

            // 호버 툴팁 박스 렌더링
            this.drawTooltip(ctx, pt, hoverX, padTop, plotWidth, padLeft);
        }

        // 상단 범례(Legend) 렌더링
        if (this.options.showLegend) {
            this.drawLegend(ctx, w - padRight, 16);
        }
    }

    drawLegend(ctx, startX, y) {
        let curX = startX;
        ctx.font = '500 11px sans-serif';
        ctx.textAlign = 'right';

        for (let i = this.options.datasets.length - 1; i >= 0; i--) {
            const ds = this.options.datasets[i];
            const text = ds.label || ds.key;
            const textWidth = ctx.measureText(text).width;

            ctx.fillStyle = '#cbd5e1';
            ctx.fillText(text, curX, y);
            curX -= (textWidth + 6);

            // 컬러 도트
            ctx.fillStyle = ds.color;
            ctx.beginPath();
            ctx.arc(curX - 4, y - 4, 4, 0, Math.PI * 2);
            ctx.fill();
            curX -= 18;
        }
    }

    drawTooltip(ctx, pt, x, topY, plotWidth, padLeft) {
        const lines = [`t = ${pt.t.toFixed(2)}s`];
        for (const ds of this.options.datasets) {
            const val = pt[ds.key];
            const unit = ds.unit || '';
            lines.push(`${ds.label}: ${typeof val === 'number' ? val.toFixed(1) : val} ${unit}`);
        }

        ctx.font = '11px monospace';
        let maxWidth = 0;
        lines.forEach(line => {
            const w = ctx.measureText(line).width;
            if (w > maxWidth) maxWidth = w;
        });

        const boxWidth = maxWidth + 18;
        const boxHeight = lines.length * 16 + 10;
        let boxX = x + 10;
        if (boxX + boxWidth > padLeft + plotWidth) {
            boxX = x - boxWidth - 10;
        }
        let boxY = topY + 10;

        ctx.save();
        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 6) : ctx.rect(boxX, boxY, boxWidth, boxHeight);
        ctx.fill();
        ctx.stroke();

        ctx.textAlign = 'left';
        lines.forEach((line, idx) => {
            ctx.fillStyle = idx === 0 ? '#38bdf8' : '#e2e8f0';
            ctx.fillText(line, boxX + 8, boxY + 16 + idx * 16);
        });
        ctx.restore();
    }
}

// 전역 등록
if (typeof window !== 'undefined') {
    window.PhysicsChart = PhysicsChart;
}
