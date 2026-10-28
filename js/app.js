/**
 * Water Rocket Main Application Logic
 * UI 바인딩, 실시간 수치 동기화, 비교 히스토리 및 민감도 분석기
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. 핵심 컴포넌트 초기화
    const renderer = new RocketRenderer('simCanvas');
    
    // 에너지 차트 (운동에너지, 위치에너지, 총 역학적 에너지)
    const energyChart = new PhysicsChart('energyChart', {
        title: '에너지 보존 및 변화 (Kinetic & Potential Energy)',
        datasets: [
            { key: 'Ek', label: '운동에너지 (Ek)', color: '#38bdf8', unit: 'J' },
            { key: 'Ep', label: '위치에너지 (Ep)', color: '#4ade80', unit: 'J' },
            { key: 'Em', label: '역학적 에너지 (Em)', color: '#f59e0b', unit: 'J', lineWidth: 1.5 }
        ]
    });

    // 운동역학 차트 (속도, 고도, 압력 등 탭 전환 가능)
    let kineticsActiveTab = 'speed-alt';
    const kineticsChart = new PhysicsChart('kineticsChart', {
        title: '속도 및 고도 변화 (Velocity & Altitude)',
        datasets: [
            { key: 'v', label: '속력 (m/s)', color: '#f43f5e', unit: 'm/s' },
            { key: 'y', label: '고도 (m)', color: '#a855f7', unit: 'm' }
        ]
    });

    const simulator = new RocketSimulator();
    simulator.setComponents(renderer, energyChart, kineticsChart);

    // 2. DOM 요소 참조
    const elements = {
        // 입력 슬라이더 및 입력창
        tempSlider: document.getElementById('tempSlider'),
        tempInput: document.getElementById('tempInput'),
        tempVaporBadge: document.getElementById('tempVaporBadge'),

        waterSlider: document.getElementById('waterSlider'),
        waterInput: document.getElementById('waterInput'),
        waterRatioBadge: document.getElementById('waterRatioBadge'),

        pressureSlider: document.getElementById('pressureSlider'),
        pressureInput: document.getElementById('pressureInput'),
        pressurePsiBadge: document.getElementById('pressurePsiBadge'),

        massSlider: document.getElementById('massSlider'),
        massInput: document.getElementById('massInput'),

        angleSlider: document.getElementById('angleSlider'),
        angleInput: document.getElementById('angleInput'),

        // 고급 옵션
        bottleVolumeSelect: document.getElementById('bottleVolumeSelect'),
        nozzleSelect: document.getElementById('nozzleSelect'),
        expansionModelSelect: document.getElementById('expansionModelSelect'),
        windInput: document.getElementById('windInput'),

        // 액션 버튼
        btnLaunch: document.getElementById('btnLaunch'),
        btnPause: document.getElementById('btnPause'),
        btnReset: document.getElementById('btnReset'),
        speedButtons: document.querySelectorAll('.btn-speed'),
        timelineSlider: document.getElementById('timelineSlider'),

        // 카메라 제어 버튼
        btnCamAuto: document.getElementById('btnCamAuto'),
        btnCamFit: document.getElementById('btnCamFit'),
        btnCamReset: document.getElementById('btnCamReset'),

        // 실시간 텔레메트리 HUD 요소
        hudTime: document.getElementById('hudTime'),
        hudAlt: document.getElementById('hudAlt'),
        hudDist: document.getElementById('hudDist'),
        hudVel: document.getElementById('hudVel'),
        hudEk: document.getElementById('hudEk'),
        hudEp: document.getElementById('hudEp'),
        hudWater: document.getElementById('hudWater'),
        hudPressure: document.getElementById('hudPressure'),
        hudPhase: document.getElementById('hudPhase'),

        // 결과 요약 카드
        resMaxAlt: document.getElementById('resMaxAlt'),
        resFlightDist: document.getElementById('resFlightDist'),
        resFlightTime: document.getElementById('resFlightTime'),
        resMaxVel: document.getElementById('resMaxVel'),
        resMaxThrust: document.getElementById('resMaxThrust'),
        resWaterTime: document.getElementById('resWaterTime'),
        resVaporContrib: document.getElementById('resVaporContrib'),

        // 차트 탭 버튼
        tabSpeedAlt: document.getElementById('tabSpeedAlt'),
        tabThrustPressure: document.getElementById('tabThrustPressure'),

        // 히스토리 & 비교
        historyTableBody: document.getElementById('historyTableBody'),
        btnClearHistory: document.getElementById('btnClearHistory'),
        chkOverlayHistory: document.getElementById('chkOverlayHistory'),

        // 민감도 분석기
        sensitivityVarSelect: document.getElementById('sensitivityVarSelect'),
        btnRunSensitivity: document.getElementById('btnRunSensitivity'),
        sensitivityChartCanvas: document.getElementById('sensitivityChartCanvas'),
        sensitivitySummary: document.getElementById('sensitivitySummary'),

        // 안내 모달
        btnOpenTheory: document.getElementById('btnOpenTheory'),
        btnCloseTheory: document.getElementById('btnCloseTheory'),
        theoryModal: document.getElementById('theoryModal')
    };

    // 히스토리 색상 팔레트
    const HISTORY_COLORS = [
        '#38bdf8', '#f43f5e', '#a855f7', '#f59e0b', '#10b981', '#ec4899'
    ];
    let runHistory = [];
    let runCounter = 1;

    // 3. 파라미터 읽기 함수
    function getParamsFromUI() {
        const bottleVolL = parseFloat(elements.bottleVolumeSelect.value) || 2.0;
        return {
            waterTempC: parseFloat(elements.tempSlider.value),
            waterVolumeL: parseFloat(elements.waterSlider.value) / 1000, // mL -> L
            airPressureBar: parseFloat(elements.pressureSlider.value),
            dryMassKg: parseFloat(elements.massSlider.value) / 1000,    // g -> kg
            launchAngleDeg: parseFloat(elements.angleSlider.value),
            bottleVolumeL: bottleVolL,
            nozzleDiameterM: parseFloat(elements.nozzleSelect.value),
            isAdiabatic: elements.expansionModelSelect.value === 'adiabatic',
            windSpeed: parseFloat(elements.windInput.value) || 0
        };
    }

    // 4. 슬라이더 & 인풋 실시간 양방향 동기화 및 물리 뱃지 갱신
    function updateDerivedBadges() {
        const params = getParamsFromUI();

        // 수온 포화증기압 계산
        const pVapPa = RocketPhysics.getSaturatedVaporPressure(params.waterTempC);
        const pVapKPa = (pVapPa / 1000).toFixed(2);
        const pVapBar = (pVapPa / 1e5).toFixed(3);
        elements.tempVaporBadge.textContent = `포화 증기압: ${pVapKPa} kPa (${pVapBar} bar)`;

        // 물/공기 비율
        const totalMl = params.bottleVolumeL * 1000;
        const waterMl = parseFloat(elements.waterSlider.value);
        const ratio = ((waterMl / totalMl) * 100).toFixed(0);
        let ratioDesc = '';
        if (ratio < 20) ratioDesc = '(공기 과다/추진제 부족)';
        else if (ratio <= 40) ratioDesc = '(권장 최적 범위: 30~35%)';
        else ratioDesc = '(물 과다/공기실 부족)';
        elements.waterRatioBadge.textContent = `용량 대비 ${ratio}% ${ratioDesc}`;

        // 압력 psi 변환
        const psi = (params.airPressureBar * 14.5038).toFixed(1);
        elements.pressurePsiBadge.textContent = `약 ${psi} psi (${(params.airPressureBar * 100).toFixed(0)} kPa)`;

        // 물 슬라이더의 최대치를 병 용량에 맞게 자동 조절
        const maxWater = totalMl * 0.9;
        elements.waterSlider.max = maxWater;
        elements.waterInput.max = maxWater;
        if (waterMl > maxWater) {
            elements.waterSlider.value = maxWater;
            elements.waterInput.value = maxWater;
        }
    }

    function setupSync(slider, input) {
        slider.addEventListener('input', () => {
            input.value = slider.value;
            updateDerivedBadges();
            if (!simulator.isPlaying) {
                previewRocket();
            }
        });
        input.addEventListener('change', () => {
            slider.value = input.value;
            updateDerivedBadges();
            if (!simulator.isPlaying) {
                previewRocket();
            }
        });
    }

    setupSync(elements.tempSlider, elements.tempInput);
    setupSync(elements.waterSlider, elements.waterInput);
    setupSync(elements.pressureSlider, elements.pressureInput);
    setupSync(elements.massSlider, elements.massInput);
    setupSync(elements.angleSlider, elements.angleInput);

    elements.bottleVolumeSelect.addEventListener('change', () => {
        updateDerivedBadges();
        if (!simulator.isPlaying) previewRocket();
    });
    elements.nozzleSelect.addEventListener('change', () => {
        if (!simulator.isPlaying) previewRocket();
    });
    elements.expansionModelSelect.addEventListener('change', () => {
        if (!simulator.isPlaying) previewRocket();
    });
    elements.windInput.addEventListener('input', () => {
        if (!simulator.isPlaying) previewRocket();
    });

    // 5. 발사 전 정적 프리뷰 렌더링
    function previewRocket() {
        const params = getParamsFromUI();
        const sim = simulator.loadSimulation(params);
        updateResultsUI(sim.metrics, false);
    }

    // 6. 결과 요약 카드 업데이트
    function updateResultsUI(metrics, isFinished = false) {
        if (!metrics) return;
        elements.resMaxAlt.textContent = `${metrics.maxAltitude} m`;
        elements.resFlightDist.textContent = `${metrics.flightDistance} m`;
        elements.resFlightTime.textContent = `${metrics.flightTime} s`;
        elements.resMaxVel.textContent = `${metrics.maxVelocity} m/s (${(metrics.maxVelocity * 3.6).toFixed(1)} km/h)`;
        elements.resMaxThrust.textContent = `${metrics.maxThrust} N`;
        elements.resWaterTime.textContent = `${metrics.waterEndTime} s`;
        elements.resVaporContrib.textContent = `+${metrics.vaporPressureKPa} kPa`;
    }

    // 7. 실시간 프레임 콜백 (HUD 및 타임라인 동기화)
    simulator.onUpdateCallback = (pt, currentTime, fullSim) => {
        if (!pt) return;
        elements.hudTime.textContent = `${currentTime.toFixed(2)}s`;
        elements.hudAlt.textContent = `${pt.y.toFixed(1)}m`;
        elements.hudDist.textContent = `${pt.x.toFixed(1)}m`;
        elements.hudVel.textContent = `${pt.v.toFixed(1)}m/s (${(pt.v * 3.6).toFixed(0)}km/h)`;
        elements.hudEk.textContent = `${pt.Ek.toFixed(0)} J`;
        elements.hudEp.textContent = `${pt.Ep.toFixed(0)} J`;
        elements.hudWater.textContent = `${pt.waterVolumeMl.toFixed(0)} mL`;
        elements.hudPressure.textContent = `${pt.pressureBar.toFixed(2)} bar`;

        if (elements.hudPhase) {
            let phaseText = '대기';
            let phaseColor = '#cbd5e1';
            if (pt.phase === 'water') {
                phaseText = '💧 물 분출';
                phaseColor = '#38bdf8';
            } else if (pt.phase === 'air') {
                phaseText = '💨 공기 분출';
                phaseColor = '#facc15';
            } else if (pt.phase === 'ballistic') {
                phaseText = '🎯 탄도 비행';
                phaseColor = '#4ade80';
            } else if (pt.phase === 'landed') {
                phaseText = '🏁 착지';
                phaseColor = '#94a3b8';
            }
            elements.hudPhase.textContent = phaseText;
            elements.hudPhase.style.color = phaseColor;
        }

        // 타임라인 슬라이더 동기화
        if (fullSim && fullSim.metrics.flightTime > 0) {
            const progress = (currentTime / fullSim.metrics.flightTime) * 100;
            elements.timelineSlider.value = progress;
        }
    };

    // 8. 발사 완료 콜백
    simulator.onFinishCallback = (sim) => {
        elements.btnLaunch.disabled = false;
        elements.btnPause.textContent = '▶ 재생';
        updateResultsUI(sim.metrics, true);

        // 히스토리에 자동 추가
        addRunToHistory(sim);
    };

    // 9. 발사 버튼 클릭 핸들러
    function launch() {
        const params = getParamsFromUI();
        const sim = simulator.loadSimulation(params);
        updateResultsUI(sim.metrics, false);

        renderer.camera.mode = 'auto';
        simulator.start();

        elements.btnPause.textContent = '⏸ 일시정지';
        highlightButton(elements.btnLaunch);
    }

    elements.btnLaunch.addEventListener('click', launch);

    elements.btnPause.addEventListener('click', () => {
        simulator.togglePlay();
        elements.btnPause.textContent = simulator.isPlaying ? '⏸ 일시정지' : '▶ 재생';
    });

    elements.btnReset.addEventListener('click', () => {
        simulator.reset();
        elements.btnPause.textContent = '▶ 재생';
        elements.timelineSlider.value = 0;
    });

    // 타임라인 슬라이더 조작
    elements.timelineSlider.addEventListener('input', (e) => {
        if (!simulator.fullSim) return;
        const ratio = parseFloat(e.target.value) / 100;
        const targetT = ratio * simulator.fullSim.metrics.flightTime;
        simulator.seekToTime(targetT);
    });

    // 배속 조절
    elements.speedButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.speedButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const speed = parseFloat(btn.dataset.speed);
            simulator.setSpeed(speed);
        });
    });

    // 카메라 모드 버튼
    elements.btnCamAuto.addEventListener('click', () => {
        renderer.setCameraMode('auto', simulator.fullSim?.trajectory[simulator.currentIndex]);
    });
    elements.btnCamFit.addEventListener('click', () => {
        renderer.setCameraMode('fit', null, simulator.fullSim);
    });
    elements.btnCamReset.addEventListener('click', () => {
        renderer.camera.x = 0;
        renderer.camera.y = 0;
        renderer.camera.scale = 12.0;
        renderer.camera.mode = 'auto';
    });

    // 차트 탭 전환
    elements.tabSpeedAlt.addEventListener('click', () => {
        elements.tabSpeedAlt.classList.add('active');
        elements.tabThrustPressure.classList.remove('active');
        kineticsChart.options.title = '속도 및 고도 변화 (Velocity & Altitude)';
        kineticsChart.options.datasets = [
            { key: 'v', label: '속력 (m/s)', color: '#f43f5e', unit: 'm/s' },
            { key: 'y', label: '고도 (m)', color: '#a855f7', unit: 'm' }
        ];
        kineticsChart.setData(simulator.fullSim ? simulator.fullSim.trajectory : []);
    });

    elements.tabThrustPressure.addEventListener('click', () => {
        elements.tabThrustPressure.classList.add('active');
        elements.tabSpeedAlt.classList.remove('active');
        kineticsChart.options.title = '추력 및 내부 압력 (Thrust & Pressure)';
        kineticsChart.options.datasets = [
            { key: 'thrust', label: '추력 (N)', color: '#38bdf8', unit: 'N' },
            { key: 'pressureBar', label: '내부 압력 (bar)', color: '#eab308', unit: 'bar' }
        ];
        kineticsChart.setData(simulator.fullSim ? simulator.fullSim.trajectory : []);
    });

    // 10. 히스토리 기록 및 궤적 오버레이
    function addRunToHistory(sim) {
        const color = HISTORY_COLORS[(runCounter - 1) % HISTORY_COLORS.length];
        const runName = `Run #${runCounter}`;
        const item = {
            id: runCounter++,
            name: runName,
            color,
            params: { ...sim.params },
            metrics: { ...sim.metrics },
            sim
        };
        runHistory.unshift(item);
        if (runHistory.length > 8) runHistory.pop();

        // 렌더러에 히스토리 등록
        renderer.addHistoryTrajectory(item);
        renderHistoryTable();
    }

    function renderHistoryTable() {
        if (!elements.historyTableBody) return;
        elements.historyTableBody.innerHTML = '';

        if (runHistory.length === 0) {
            elements.historyTableBody.innerHTML = `
                <tr><td colspan="8" class="text-center text-slate-400 py-3">발사 기록이 없습니다. 발사를 진행해 보세요!</td></tr>
            `;
            return;
        }

        runHistory.forEach(item => {
            const tr = document.createElement('tr');
            tr.className = 'border-b border-slate-700/50 hover:bg-slate-800/40 text-xs transition-colors';
            tr.innerHTML = `
                <td class="py-2 px-2 font-bold" style="color: ${item.color}">${item.name}</td>
                <td class="py-2 px-2">${item.params.waterTempC}°C</td>
                <td class="py-2 px-2">${(item.params.waterVolumeL * 1000).toFixed(0)}mL</td>
                <td class="py-2 px-2">${item.params.airPressureBar}bar</td>
                <td class="py-2 px-2">${(item.params.dryMassKg * 1000).toFixed(0)}g</td>
                <td class="py-2 px-2">${item.params.launchAngleDeg}°</td>
                <td class="py-2 px-2 font-semibold text-emerald-400">${item.metrics.maxAltitude}m</td>
                <td class="py-2 px-2 font-bold text-sky-400">${item.metrics.flightDistance}m</td>
            `;
            // 행 클릭 시 해당 세팅 UI에 즉시 불러오기
            tr.style.cursor = 'pointer';
            tr.title = '클릭하면 이 실행의 조건을 다시 불러옵니다';
            tr.addEventListener('click', () => {
                applyParamsToUI(item.params);
                previewRocket();
            });
            elements.historyTableBody.appendChild(tr);
        });
    }

    elements.btnClearHistory.addEventListener('click', () => {
        runHistory = [];
        renderer.clearHistory();
        renderHistoryTable();
        renderer.render(simulator.fullSim?.trajectory[simulator.currentIndex], simulator.fullSim, simulator.currentIndex);
    });

    elements.chkOverlayHistory.addEventListener('change', (e) => {
        renderer.showHistory = e.target.checked;
        renderer.render(simulator.fullSim?.trajectory[simulator.currentIndex], simulator.fullSim, simulator.currentIndex);
    });

    function applyParamsToUI(p) {
        elements.tempSlider.value = p.waterTempC;
        elements.tempInput.value = p.waterTempC;
        elements.waterSlider.value = (p.waterVolumeL * 1000).toFixed(0);
        elements.waterInput.value = (p.waterVolumeL * 1000).toFixed(0);
        elements.pressureSlider.value = p.airPressureBar;
        elements.pressureInput.value = p.airPressureBar;
        elements.massSlider.value = (p.dryMassKg * 1000).toFixed(0);
        elements.massInput.value = (p.dryMassKg * 1000).toFixed(0);
        elements.angleSlider.value = p.launchAngleDeg;
        elements.angleInput.value = p.launchAngleDeg;
        elements.bottleVolumeSelect.value = p.bottleVolumeL;
        elements.nozzleSelect.value = p.nozzleDiameterM;
        elements.expansionModelSelect.value = p.isAdiabatic ? 'adiabatic' : 'isothermal';
        updateDerivedBadges();
    }

    // 11. 빠른 프리셋 버튼 바인딩
    document.querySelectorAll('[data-preset]').forEach(btn => {
        btn.addEventListener('click', () => {
            const preset = btn.dataset.preset;
            if (preset === 'optimal-range') {
                // 비행거리 극대화: 45도, 물 600mL(30%), 압력 6bar, 수온 30도
                applyParamsToUI({
                    waterTempC: 30,
                    waterVolumeL: 0.6,
                    airPressureBar: 6.0,
                    dryMassKg: 0.15,
                    launchAngleDeg: 45,
                    bottleVolumeL: 2.0,
                    nozzleDiameterM: 0.021,
                    isAdiabatic: true
                });
            } else if (preset === 'max-altitude') {
                // 수직 최고 고도: 85도, 물 550mL, 6.5bar
                applyParamsToUI({
                    waterTempC: 25,
                    waterVolumeL: 0.55,
                    airPressureBar: 6.5,
                    dryMassKg: 0.12,
                    launchAngleDeg: 85,
                    bottleVolumeL: 2.0,
                    nozzleDiameterM: 0.021,
                    isAdiabatic: true
                });
            } else if (preset === 'hot-water') {
                // 온수 증기압 효과: 수온 70도, 물 600mL, 5bar
                applyParamsToUI({
                    waterTempC: 70,
                    waterVolumeL: 0.6,
                    airPressureBar: 5.0,
                    dryMassKg: 0.15,
                    launchAngleDeg: 45,
                    bottleVolumeL: 2.0,
                    nozzleDiameterM: 0.021,
                    isAdiabatic: true
                });
            } else if (preset === 'cold-water') {
                // 냉수 비교군: 수온 5도, 물 600mL, 5bar
                applyParamsToUI({
                    waterTempC: 5,
                    waterVolumeL: 0.6,
                    airPressureBar: 5.0,
                    dryMassKg: 0.15,
                    launchAngleDeg: 45,
                    bottleVolumeL: 2.0,
                    nozzleDiameterM: 0.021,
                    isAdiabatic: true
                });
            } else if (preset === 'low-water') {
                // 물 부족 (공기만 많고 분출 질량 부족): 물 150mL
                applyParamsToUI({
                    waterTempC: 25,
                    waterVolumeL: 0.15,
                    airPressureBar: 5.0,
                    dryMassKg: 0.15,
                    launchAngleDeg: 45,
                    bottleVolumeL: 2.0,
                    nozzleDiameterM: 0.021,
                    isAdiabatic: true
                });
            } else if (preset === 'high-water') {
                // 물 과다 (너무 무거움): 물 1400mL
                applyParamsToUI({
                    waterTempC: 25,
                    waterVolumeL: 1.4,
                    airPressureBar: 5.0,
                    dryMassKg: 0.15,
                    launchAngleDeg: 45,
                    bottleVolumeL: 2.0,
                    nozzleDiameterM: 0.021,
                    isAdiabatic: true
                });
            }
            previewRocket();
        });
    });

    // 12. 변수 민감도 분석기 (Sensitivity Explorer)
    let sensitivityChart = null;
    function renderSensitivityAnalysis() {
        const varName = elements.sensitivityVarSelect.value;
        const baseParams = getParamsFromUI();
        const analysis = RocketPhysics.runSensitivityAnalysis(varName, baseParams, 16);

        // 요약 메시지
        let bestDist = 0;
        let bestDistVal = 0;
        let bestAlt = 0;
        let bestAltVal = 0;

        analysis.results.forEach(r => {
            if (r.flightDistance > bestDist) {
                bestDist = r.flightDistance;
                bestDistVal = r.xValue;
            }
            if (r.maxAltitude > bestAlt) {
                bestAlt = r.maxAltitude;
                bestAltVal = r.xValue;
            }
        });

        elements.sensitivitySummary.innerHTML = `
            <div class="p-2 bg-slate-800/80 rounded border border-slate-700 text-xs">
                💡 <strong>분석 결과:</strong> 비행거리 최대값은 <strong>${analysis.config.label} = ${bestDistVal}${analysis.config.unit}</strong>일 때 <span class="text-sky-400 font-bold">${bestDist.toFixed(1)}m</span>이며, 
                최고 고도 최대값은 <strong>${bestAltVal}${analysis.config.unit}</strong>일 때 <span class="text-emerald-400 font-bold">${bestAlt.toFixed(1)}m</span>입니다.
            </div>
        `;

        // 캔버스에 민감도 곡선 그리기
        drawSensitivityCanvas(analysis);
    }

    function drawSensitivityCanvas(analysis) {
        const canvas = elements.sensitivityChartCanvas;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        const w = rect.width;
        const h = rect.height;
        ctx.clearRect(0, 0, w, h);

        const padLeft = 45;
        const padRight = 45;
        const padTop = 25;
        const padBottom = 30;
        const plotW = w - padLeft - padRight;
        const plotH = h - padTop - padBottom;

        // 배경
        ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
        ctx.fillRect(padLeft, padTop, plotW, plotH);

        const res = analysis.results;
        if (!res || res.length === 0) return;

        // 최대거리, 최대고도 스케일
        const maxDist = Math.max(...res.map(r => r.flightDistance)) * 1.15 || 50;
        const maxAlt = Math.max(...res.map(r => r.maxAltitude)) * 1.15 || 50;

        // X축 좌표
        const getX = (i) => padLeft + (i / (res.length - 1)) * plotW;
        const getYDist = (val) => padTop + plotH - (val / maxDist) * plotH;
        const getYAlt = (val) => padTop + plotH - (val / maxAlt) * plotH;

        // 그리드
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padTop + (i / 4) * plotH;
            ctx.beginPath();
            ctx.moveTo(padLeft, y);
            ctx.lineTo(padLeft + plotW, y);
            ctx.stroke();
        }

        // 비행거리 라인 (Sky Blue)
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        res.forEach((r, idx) => {
            const px = getX(idx);
            const py = getYDist(r.flightDistance);
            if (idx === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        });
        ctx.stroke();

        // 최고고도 라인 (Emerald Green)
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 2;
        ctx.beginPath();
        res.forEach((r, idx) => {
            const px = getX(idx);
            const py = getYAlt(r.maxAltitude);
            if (idx === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        });
        ctx.stroke();

        // 데이터 포인트 및 X축 레이블
        ctx.font = '10px monospace';
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'center';
        res.forEach((r, idx) => {
            const px = getX(idx);
            if (idx % 2 === 0 || idx === res.length - 1) {
                ctx.fillText(r.xValue, px, padTop + plotH + 15);
            }

            // 포인트 원
            ctx.fillStyle = '#38bdf8';
            ctx.beginPath();
            ctx.arc(px, getYDist(r.flightDistance), 3, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#4ade80';
            ctx.beginPath();
            ctx.arc(px, getYAlt(r.maxAltitude), 2.5, 0, Math.PI * 2);
            ctx.fill();
        });

        // 범례
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#38bdf8';
        ctx.fillText('● 비행 거리 (m)', padLeft + 10, 16);
        ctx.fillStyle = '#4ade80';
        ctx.fillText('● 최고 고도 (m)', padLeft + 120, 16);
    }

    elements.btnRunSensitivity.addEventListener('click', renderSensitivityAnalysis);
    elements.sensitivityVarSelect.addEventListener('change', renderSensitivityAnalysis);

    // 13. 이론 안내 모달 제어
    elements.btnOpenTheory.addEventListener('click', () => {
        elements.theoryModal.classList.remove('hidden');
    });
    elements.btnCloseTheory.addEventListener('click', () => {
        elements.theoryModal.classList.add('hidden');
    });
    elements.theoryModal.addEventListener('click', (e) => {
        if (e.target === elements.theoryModal) {
            elements.theoryModal.classList.add('hidden');
        }
    });

    function highlightButton(btn) {
        btn.classList.add('ring-2', 'ring-sky-400');
        setTimeout(() => btn.classList.remove('ring-2', 'ring-sky-400'), 500);
    }

    // 초기 상태 로드
    updateDerivedBadges();
    previewRocket();
    renderHistoryTable();
    setTimeout(renderSensitivityAnalysis, 200);
});
