/**
 * Interactive Real-time Canvas Chart Engine
 * - 애니메이션이 끝날 때까지 결과를 예측할 수 없도록 현재 진행 시간(currentTime)까지만 실시간 렌더링
 * - 문자 잘림 및 중첩 완벽 방지
 */

class PhysicsChart {
    constructor(canvasId, options = {}) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.options = Object.assign({
            xLabel: '시간 (s)',
            yLabel: '',
            datasets: []
        }, options);

        this.data = [];
        this.currentTime = 0;
        this.isRevealed = false; // 착지 완료 후 전체 공개 여부
        this.isStarted = false;  // 발사 시작 여부
        this.hoverIndex = -1;

        this.initEvents();
        this.resize();
        window.addEventListener('resize', () => this.resize());
        if (typeof ResizeObserver !== 'undefined' && this.canvas.parentElement) {
            this.resizeObserver = new ResizeObserver(() => this.resize());
            this.resizeObserver.observe(this.canvas.parentElement);
        }
    }

    resize() {
        if (!this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);
        this.width = rect.width;
        this.height = rect.height;
        this.render();
    }

    initEvents() {
        if (!this.canvas) return;
        this.canvas.addEventListener('mousemove', (e) => {
            if (!this.isStarted && !this.isRevealed) return;
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            this.handleHover(mouseX);
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.hoverIndex = -1;
            this.render();
        });
    }

    setData(trajectoryData, isStarted = false, isRevealed = false) {
        this.data = trajectoryData || [];
        this.isStarted = isStarted;
        this.isRevealed = isRevealed;
        this.hoverIndex = -1;
        this.render();
    }

    setProgress(t, isStarted = true, isRevealed = false) {
        this.currentTime = t;
        this.isStarted = isStarted;
        this.isRevealed = isRevealed;
        this.render();
    }

    getVisibleData() {
        if (!this.data || this.data.length === 0) return [];
        if (this.isRevealed) return this.data;
        if (!this.isStarted) return [];
        return this.data.filter(pt => pt.t <= this.currentTime + 0.005);
    }

    handleHover(mouseX) {
        const visible = this.getVisibleData();
        if (visible.length === 0) return;

        const padLeft = 46;
        const padRight = 18;
        const plotWidth = this.width - padLeft - padRight;
        if (mouseX < padLeft || mouseX > this.width - padRight) {
            this.hoverIndex = -1;
            this.render();
            return;
        }

        const maxT = this.getDisplayMaxT(visible);
        const targetT = ((mouseX - padLeft) / plotWidth) * maxT;

        let closestIdx = 0;
        let minDiff = Infinity;
        for (let i = 0; i < visible.length; i++) {
            const diff = Math.abs(visible[i].t - targetT);
            if (diff < minDiff) {
                minDiff = diff;
                closestIdx = i;
            }
        }
        this.hoverIndex = closestIdx;
        this.render();
    }

    getDisplayMaxT(visible) {
        if (this.isRevealed && this.data.length > 0) {
            return Math.max(0.5, this.data[this.data.length - 1].t);
        }
        // 비행 중에는 최종 비행 시간을 예측할 수 없도록 현재 진행 시간에 맞춰 동적 스케일링
        const curr = visible.length > 0 ? visible[visible.length - 1].t : 0.5;
        return Math.max(1.5, curr * 1.15);
    }

    render() {
        if (!this.ctx || !this.width || !this.height) return;
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;

        ctx.clearRect(0, 0, w, h);

        const padLeft = 46;
        const padRight = 18;
        const padTop = 10;
        const padBottom = 22;
        const plotWidth = Math.max(20, w - padLeft - padRight);
        const plotHeight = Math.max(20, h - padTop - padBottom);

        // 차분한 우주 슬레이트 플롯 배경
        ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
        ctx.fillRect(padLeft, padTop, plotWidth, plotHeight);

        const visible = this.getVisibleData();

        if (visible.length === 0) {
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
            ctx.lineWidth = 1;
            ctx.strokeRect(padLeft, padTop, plotWidth, plotHeight);

            ctx.fillStyle = '#cbd5e1';
            ctx.textAlign = 'center';
            ctx.font = '600 12px -apple-system, BlinkMacSystemFont, "Pretendard", sans-serif';
            ctx.fillText('🚀 발사 시 실시간으로 그래프가 그려집니다', padLeft + plotWidth / 2, padTop + plotHeight / 2 + 4);
            return;
        }

        const maxT = this.getDisplayMaxT(visible);
        let maxY = 10;
        let minY = 0;

        for (const ds of this.options.datasets) {
            for (const pt of visible) {
                const val = pt[ds.key] ?? 0;
                if (val > maxY) maxY = val;
                if (val < minY) minY = val;
            }
        }
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
        const ySteps = 3;
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
        ctx.lineWidth = 1;
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '600 10px monospace';
        ctx.textAlign = 'right';

        for (let i = 0; i <= ySteps; i++) {
            const val = minY + (maxY - minY) * (i / ySteps);
            const y = padTop + plotHeight - (i / ySteps) * plotHeight;
            ctx.beginPath();
            ctx.moveTo(padLeft, y);
            ctx.lineTo(padLeft + plotWidth, y);
            ctx.stroke();

            const labelText = val >= 1000 ? (val / 1000).toFixed(1) + 'k' : val.toFixed(maxY < 15 ? 1 : 0);
            ctx.fillText(labelText, padLeft - 6, y + 3);
        }

        // X축 시간 눈금
        const xSteps = 4;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#cbd5e1';
        for (let i = 0; i <= xSteps; i++) {
            const tVal = (maxT * i) / xSteps;
            const x = padLeft + (i / xSteps) * plotWidth;
            ctx.beginPath();
            ctx.moveTo(x, padTop + plotHeight);
            ctx.lineTo(x, padTop + plotHeight + 4);
            ctx.stroke();

            ctx.fillText(tVal.toFixed(1) + 's', x, padTop + plotHeight + 15);
        }

        // 플롯 테두리
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(padLeft, padTop, plotWidth, plotHeight);

        // 데이터셋 라인 그리기 (현재 진행된 시점까지만)
        for (const ds of this.options.datasets) {
            ctx.save();
            ctx.strokeStyle = ds.color || '#38bdf8';
            ctx.lineWidth = ds.lineWidth || 2.2;
            ctx.lineJoin = 'round';
            ctx.beginPath();

            for (let i = 0; i < visible.length; i++) {
                const pt = visible[i];
                const x = getXPixel(pt.t);
                const y = getYPixel(pt[ds.key] ?? 0);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
            ctx.restore();
        }

        // 마우스 호버 툴팁
        const activeIdx = this.hoverIndex >= 0 ? this.hoverIndex : null;
        if (activeIdx !== null && visible[activeIdx]) {
            const pt = visible[activeIdx];
            const hoverX = getXPixel(pt.t);

            ctx.save();
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.moveTo(hoverX, padTop);
            ctx.lineTo(hoverX, padTop + plotHeight);
            ctx.stroke();
            ctx.restore();

            for (const ds of this.options.datasets) {
                const hoverY = getYPixel(pt[ds.key] ?? 0);
                ctx.fillStyle = ds.color || '#38bdf8';
                ctx.beginPath();
                ctx.arc(hoverX, hoverY, 4, 0, Math.PI * 2);
                ctx.fill();
            }

            this.drawTooltip(ctx, pt, hoverX, padTop, plotWidth, padLeft);
        }
    }

    drawTooltip(ctx, pt, x, topY, plotWidth, padLeft) {
        const lines = [`t = ${pt.t.toFixed(2)}s`];
        for (const ds of this.options.datasets) {
            const val = pt[ds.key];
            const unit = ds.unit || '';
            lines.push(`${ds.label}: ${typeof val === 'number' ? val.toFixed(1) : val}${unit}`);
        }

        ctx.font = '600 10px -apple-system, BlinkMacSystemFont, monospace';
        let maxWidth = 0;
        lines.forEach(line => {
            const w = ctx.measureText(line).width;
            if (w > maxWidth) maxWidth = w;
        });

        const boxWidth = maxWidth + 16;
        const boxHeight = lines.length * 15 + 8;
        let boxX = x + 10;
        if (boxX + boxWidth > padLeft + plotWidth - 4) {
            boxX = x - boxWidth - 10;
        }
        boxX = Math.max(padLeft + 4, boxX);
        const boxY = topY + 6;

        ctx.save();
        ctx.fillStyle = 'rgba(9, 13, 24, 0.94)';
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 5) : ctx.rect(boxX, boxY, boxWidth, boxHeight);
        ctx.fill();
        ctx.stroke();

        ctx.textAlign = 'left';
        lines.forEach((line, idx) => {
            ctx.fillStyle = idx === 0 ? '#7dd3fc' : '#f8fafc';
            ctx.fillText(line, boxX + 8, boxY + 14 + idx * 15);
        });
        ctx.restore();
    }
}

if (typeof window !== 'undefined') {
    window.PhysicsChart = PhysicsChart;
}
