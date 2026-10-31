/**
 * IAGTM (화성 갈끄니까) - Main Application Controller
 * - 깔끔하고 눈이 편안한 100vh 노스크롤 대시보드 연동
 * - 애니메이션 종료(착지) 전까지 결과 예측 불가 처리
 * - 1회 변수 조정 -> 발사 및 착지 완료 -> 변수 설정값 초기값으로 자동 복귀 -> 2회 변수 조정
 * - 착지 후 초기값, 1차, 2차 변경 전체 궤적 동시 표시 및 초기값 대비 개선/악화 키워드 분석 (삼각형 기호 제거)
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. 렌더러 및 차트 초기화
    const renderer = new RocketRenderer('simCanvas');

    const energyChart = new PhysicsChart('energyChart', {
        datasets: [
            { key: 'Ek', label: '운동(Ek)', color: '#38bdf8', unit: 'J', lineWidth: 2.2 },
            { key: 'Ep', label: '위치(Ep)', color: '#34d399', unit: 'J', lineWidth: 2.2 },
            { key: 'Em', label: '역학적(Em)', color: '#fbbf24', unit: 'J', lineWidth: 1.6 }
        ]
    });

    const kineticsChart = new PhysicsChart('kineticsChart', {
        datasets: [
            { key: 'v', label: '속력(v)', color: '#fb7185', unit: 'm/s', lineWidth: 2.2 },
            { key: 'y', label: '고도(h)', color: '#c084fc', unit: 'm', lineWidth: 2.2 }
        ]
    });

    const simulator = new RocketSimulator();
    simulator.setComponents(renderer, energyChart, kineticsChart);

    // 2. DOM 요소 참조
    const elements = {
        tempSlider: document.getElementById('tempSlider'),
        tempInput: document.getElementById('tempInput'),

        waterSlider: document.getElementById('waterSlider'),
        waterInput: document.getElementById('waterInput'),

        pressureSlider: document.getElementById('pressureSlider'),
        pressureInput: document.getElementById('pressureInput'),

        massSlider: document.getElementById('massSlider'),
        massInput: document.getElementById('massInput'),

        angleSlider: document.getElementById('angleSlider'),
        angleInput: document.getElementById('angleInput'),

        varBoxes: {
            waterTempC: document.getElementById('varBox_waterTempC'),
            waterVolumeMl: document.getElementById('varBox_waterVolumeMl'),
            airPressureBar: document.getElementById('varBox_airPressureBar'),
            dryMassG: document.getElementById('varBox_dryMassG'),
            launchAngleDeg: document.getElementById('varBox_launchAngleDeg')
        },

        changeStepBadge: document.getElementById('changeStepBadge'),
        changeStepGuide: document.getElementById('changeStepGuide'),
        btnUndoCurrentVar: document.getElementById('btnUndoCurrentVar'),
        btnResetExperiment: document.getElementById('btnResetExperiment'),
        analysisStatusTag: document.getElementById('analysisStatusTag'),
        twoStepAnalysisText: document.getElementById('twoStepAnalysisText'),

        btnLaunch: document.getElementById('btnLaunch'),
        btnPause: document.getElementById('btnPause'),
        btnReset: document.getElementById('btnReset'),
        speedButtons: document.querySelectorAll('.btn-speed'),

        btnCamAuto: document.getElementById('btnCamAuto'),
        btnCamFit: document.getElementById('btnCamFit'),
        btnCamReset: document.getElementById('btnCamReset'),

        hudTime: document.getElementById('hudTime'),
        hudAlt: document.getElementById('hudAlt'),
        hudDist: document.getElementById('hudDist'),
        hudVel: document.getElementById('hudVel'),
        hudWater: document.getElementById('hudWater'),

        resultRevealBadge: document.getElementById('resultRevealBadge'),
        resMaxAlt: document.getElementById('resMaxAlt'),
        resFlightDist: document.getElementById('resFlightDist'),
        resFlightTime: document.getElementById('resFlightTime'),

        diffMaxAlt: document.getElementById('diffMaxAlt'),
        diffFlightDist: document.getElementById('diffFlightDist'),
        diffFlightTime: document.getElementById('diffFlightTime'),

        tabSpeedAlt: document.getElementById('tabSpeedAlt'),
        tabThrustPressure: document.getElementById('tabThrustPressure'),
        kineticsChartTitle: document.getElementById('kineticsChartTitle'),
        kineticsLegendBar: document.getElementById('kineticsLegendBar'),
        kineticsGraphCaption: document.getElementById('kineticsGraphCaption'),

        historyTableBody: document.getElementById('historyTableBody'),
        chkOverlayHistory: document.getElementById('chkOverlayHistory'),

        introModal: document.getElementById('introModal'),
        modalStep1: document.getElementById('modalStep1'),
        modalStep2: document.getElementById('modalStep2'),
        btnModalNext: document.getElementById('btnModalNext'),
        btnModalClose: document.getElementById('btnModalClose')
    };

    // 3. 5대 변수 메타데이터 및 초기값 정의
    const VAR_META = {
        waterTempC: {
            label: '수온',
            unit: '°C',
            defaultVal: 25,
            slider: elements.tempSlider,
            input: elements.tempInput
        },
        waterVolumeMl: {
            label: '물의 양',
            unit: 'mL',
            defaultVal: 600,
            slider: elements.waterSlider,
            input: elements.waterInput
        },
        airPressureBar: {
            label: '공기 압력',
            unit: 'bar',
            defaultVal: 5.0,
            slider: elements.pressureSlider,
            input: elements.pressureInput
        },
        dryMassG: {
            label: '로켓 질량',
            unit: 'g',
            defaultVal: 150,
            slider: elements.massSlider,
            input: elements.massInput
        },
        launchAngleDeg: {
            label: '발사각',
            unit: '°',
            defaultVal: 45,
            slider: elements.angleSlider,
            input: elements.angleInput
        }
    };

    function getDefaultRawValues() {
        return {
            waterTempC: VAR_META.waterTempC.defaultVal,
            waterVolumeMl: VAR_META.waterVolumeMl.defaultVal,
            airPressureBar: VAR_META.airPressureBar.defaultVal,
            dryMassG: VAR_META.dryMassG.defaultVal,
            launchAngleDeg: VAR_META.launchAngleDeg.defaultVal
        };
    }

    function getCurrentRawValues() {
        return {
            waterTempC: parseFloat(elements.tempSlider.value),
            waterVolumeMl: parseFloat(elements.waterSlider.value),
            airPressureBar: parseFloat(elements.pressureSlider.value),
            dryMassG: parseFloat(elements.massSlider.value),
            launchAngleDeg: parseFloat(elements.angleSlider.value)
        };
    }

    function applyRawValuesToSliders(raw) {
        Object.keys(VAR_META).forEach(key => {
            VAR_META[key].slider.value = raw[key];
            VAR_META[key].input.value = raw[key];
        });
    }

    function rawValuesToPhysicsParams(raw) {
        return {
            waterTempC: raw.waterTempC,
            waterVolumeL: raw.waterVolumeMl / 1000,
            airPressureBar: raw.airPressureBar,
            dryMassKg: raw.dryMassG / 1000,
            launchAngleDeg: raw.launchAngleDeg,
            bottleVolumeL: 2.0,
            nozzleDiameterM: 0.021,
            isAdiabatic: true,
            windSpeed: 0
        };
    }

    const experiment = {
        completedChanges: 0,
        activeVarKey: null,
        pendingLaunchRecord: null,
        baselineSim: null,
        baselineRevealed: false,
        changeRecords: []
    };

    // 4. 변수 잠금 및 단계 UI 업데이트
    function updateExperimentLockUI() {
        const count = experiment.completedChanges;
        const activeKey = experiment.activeVarKey;
        const isFlying = simulator.isPlaying;

        elements.changeStepBadge.textContent = `${count} / 2회 변경`;

        if (isFlying) {
            elements.changeStepGuide.textContent = '🚀 비행 진행 중... (착지 후 결과 공개)';
            elements.btnUndoCurrentVar.classList.add('hidden');
            Object.keys(VAR_META).forEach(key => {
                elements.varBoxes[key].classList.add('locked-var');
                VAR_META[key].slider.disabled = true;
                VAR_META[key].input.disabled = true;
            });
            return;
        }

        if (count >= 2) {
            elements.changeStepGuide.textContent = '✅ 2회 변경 완료 · 다시 하려면 [🔄 초기화] 클릭';
            elements.btnUndoCurrentVar.classList.add('hidden');
            Object.keys(VAR_META).forEach(key => {
                const box = elements.varBoxes[key];
                box.classList.remove('active-var');
                box.classList.add('locked-var');
                VAR_META[key].slider.disabled = true;
                VAR_META[key].input.disabled = true;
            });
            return;
        }

        const nextStepNum = count + 1;

        if (!activeKey) {
            if (count === 1) {
                elements.changeStepGuide.textContent = '1차 완료 (초기값 복귀됨) ➔ 2차 변수 1개 조정 후 [발사하기] 클릭';
            } else {
                elements.changeStepGuide.textContent = '1차 변수 1개 조정 ➔ [발사하기] 클릭';
            }
            elements.btnUndoCurrentVar.classList.add('hidden');

            Object.keys(VAR_META).forEach(key => {
                const box = elements.varBoxes[key];
                box.classList.remove('active-var', 'locked-var');
                VAR_META[key].slider.disabled = false;
                VAR_META[key].input.disabled = false;
            });
        } else {
            const varLabel = VAR_META[activeKey].label;
            elements.changeStepGuide.textContent = `[${nextStepNum}차: ${varLabel}] 선택됨 ➔ 조정 후 [발사하기] 클릭`;
            elements.btnUndoCurrentVar.classList.remove('hidden');

            Object.keys(VAR_META).forEach(key => {
                const box = elements.varBoxes[key];
                if (key === activeKey) {
                    box.classList.add('active-var');
                    box.classList.remove('locked-var');
                    VAR_META[key].slider.disabled = false;
                    VAR_META[key].input.disabled = false;
                } else {
                    box.classList.remove('active-var');
                    box.classList.add('locked-var');
                    VAR_META[key].slider.disabled = true;
                    VAR_META[key].input.disabled = true;
                }
            });
        }
    }

    function onVariableManipulated(varKey) {
        if (experiment.completedChanges >= 2 || simulator.isPlaying) return;

        const currentRaw = getCurrentRawValues();
        const defVal = VAR_META[varKey].defaultVal;
        const currVal = currentRaw[varKey];

        if (Math.abs(currVal - defVal) > 1e-4) {
            experiment.activeVarKey = varKey;
        } else {
            experiment.activeVarKey = null;
        }

        updateExperimentLockUI();
        hidePredictionBeforeLaunch();
    }

    function hidePredictionBeforeLaunch() {
        const params = rawValuesToPhysicsParams(getCurrentRawValues());
        simulator.loadSimulation(params, false);
        maskResultCards('착지 시 공개');
    }

    Object.keys(VAR_META).forEach(varKey => {
        const { slider, input, defaultVal } = VAR_META[varKey];

        slider.addEventListener('input', () => {
            input.value = slider.value;
            onVariableManipulated(varKey);
        });

        input.addEventListener('change', () => {
            let val = parseFloat(input.value);
            const min = parseFloat(slider.min);
            const max = parseFloat(slider.max);
            if (isNaN(val)) val = defaultVal;
            val = Math.max(min, Math.min(max, val));
            input.value = val;
            slider.value = val;
            onVariableManipulated(varKey);
        });
    });

    elements.btnUndoCurrentVar.addEventListener('click', () => {
        if (!experiment.activeVarKey || simulator.isPlaying) return;
        applyRawValuesToSliders(getDefaultRawValues());
        experiment.activeVarKey = null;
        updateExperimentLockUI();
        hidePredictionBeforeLaunch();
    });

    // 5. 결과 예측 방지 마스킹 & 착지 후 초기값 대비 증감 공개 (삼각형 기호 제거)
    function maskResultCards(statusText = '비행 중...') {
        elements.resultRevealBadge.textContent = statusText;
        elements.resMaxAlt.textContent = '-';
        elements.resFlightDist.textContent = '-';
        elements.resFlightTime.textContent = '-';

        [elements.diffMaxAlt, elements.diffFlightDist, elements.diffFlightTime].forEach(b => {
            if (!b) return;
            b.className = 'diff-badge diff-neutral';
            b.textContent = '대기';
        });
    }

    function formatDiffBadge(el, diffVal, unit) {
        if (!el) return;
        if (Math.abs(diffVal) < 0.02) {
            el.className = 'diff-badge diff-neutral';
            el.textContent = `초기값 동일`;
            return;
        }
        const sign = diffVal > 0 ? '+' : '';
        const improved = diffVal > 0;
        el.className = `diff-badge ${improved ? 'diff-up' : 'diff-down'}`;
        el.textContent = `${sign}${diffVal.toFixed(1)}${unit} ${improved ? '개선' : '악화'}`;
    }

    function revealResultCards(metrics) {
        if (!metrics || !experiment.baselineSim) return;
        const base = experiment.baselineSim.metrics;

        elements.resultRevealBadge.textContent = '측정 완료';
        elements.resMaxAlt.textContent = `${metrics.maxAltitude} m`;
        elements.resFlightDist.textContent = `${metrics.flightDistance} m`;
        elements.resFlightTime.textContent = `${metrics.flightTime} s`;

        formatDiffBadge(elements.diffMaxAlt, metrics.maxAltitude - base.maxAltitude, 'm');
        formatDiffBadge(elements.diffFlightDist, metrics.flightDistance - base.flightDistance, 'm');
        formatDiffBadge(elements.diffFlightTime, metrics.flightTime - base.flightTime, 's');
    }

    // 6. 단어/키워드 위주 2회 변경 개선/악화 분석 생성 (삼각형 기호 제거)
    function buildKeywordVerdict(rec) {
        const base = experiment.baselineSim.metrics;
        const dDist = rec.newMetrics.flightDistance - base.flightDistance;
        const dAlt = rec.newMetrics.maxAltitude - base.maxAltitude;

        const signD = dDist >= 0 ? '+' : '';
        const signA = dAlt >= 0 ? '+' : '';

        let keywordCause = '';
        if (rec.varKey === 'waterTempC') {
            keywordCause = rec.newVal > rec.oldVal ? '증기압 증가' : '증기압 감소';
        } else if (rec.varKey === 'airPressureBar') {
            keywordCause = rec.newVal > rec.oldVal ? '단열팽창 추력 증가' : '추력 감소';
        } else if (rec.varKey === 'waterVolumeMl') {
            keywordCause = dDist >= 0 ? '적정 물 비율' : (rec.newVal > 700 ? '물 과다·공기부족' : '물 부족');
        } else if (rec.varKey === 'dryMassG') {
            keywordCause = rec.newVal < rec.oldVal ? '경량 가속 증가' : '과중량 가속 감소';
        } else if (rec.varKey === 'launchAngleDeg') {
            if (dAlt > 0 && dDist < 0) {
                return `[${rec.step}차] ${rec.varLabel}(${rec.oldVal}➔${rec.newVal}${rec.unit}) ➔ 높이 ${signA}${dAlt.toFixed(1)}m <strong class="text-emerald-300">(개선)</strong> · 거리 ${signD}${dDist.toFixed(1)}m <strong class="text-rose-300">(악화)</strong>`;
            }
            keywordCause = dDist >= 0 ? '적정 각도' : '비최적 각도';
        }

        const isImproved = dDist > 0.05 || (Math.abs(dDist) <= 0.05 && dAlt > 0.05);
        const verdictWord = isImproved
            ? '<strong class="text-emerald-300">개선</strong>'
            : '<strong class="text-rose-300">악화</strong>';

        return `[${rec.step}차] ${rec.varLabel}(${rec.oldVal}➔${rec.newVal}${rec.unit}) : ${keywordCause} ➔ 거리 ${signD}${dDist.toFixed(1)}m · 높이 ${signA}${dAlt.toFixed(1)}m (${verdictWord})`;
    }

    function updateAnalysisBanner() {
        const count = experiment.changeRecords.length;
        if (count === 0) {
            elements.analysisStatusTag.textContent = '0 / 2회';
            elements.twoStepAnalysisText.innerHTML =
                '1차 변수 발사 ➔ 초기값 자동 복귀 ➔ 2차 변수 발사 완료 시 [개선 / 악화] 분석 표시';
        } else if (count === 1) {
            const kw1 = buildKeywordVerdict(experiment.changeRecords[0]);
            elements.analysisStatusTag.textContent = '1 / 2회 완료';
            elements.twoStepAnalysisText.innerHTML = `${kw1} &nbsp;│&nbsp; <span class="text-sky-300">2차 변수 조정 대기 중</span>`;
        } else if (count >= 2) {
            const kw1 = buildKeywordVerdict(experiment.changeRecords[0]);
            const kw2 = buildKeywordVerdict(experiment.changeRecords[1]);
            elements.analysisStatusTag.textContent = '2 / 2회 완료';
            elements.twoStepAnalysisText.innerHTML = `${kw1} &nbsp;│&nbsp; ${kw2}`;
        }
    }

    // 7. 조건 변경 비교 기록표 렌더링 (삼각형 기호 제거)
    function renderHistoryTable() {
        if (!elements.historyTableBody || !experiment.baselineSim) return;
        elements.historyTableBody.innerHTML = '';

        const base = experiment.baselineSim.metrics;
        const showBase = experiment.baselineRevealed || experiment.changeRecords.length > 0;

        // 1) 초기값 행
        const trBase = document.createElement('tr');
        trBase.innerHTML = `
            <td class="py-1.5 px-2.5 font-extrabold text-slate-300">초기값(기준)</td>
            <td class="py-1.5 px-2.5 font-sans text-slate-300">25°C · 600mL · 5bar · 150g · 45°</td>
            <td class="py-1.5 px-2.5 font-bold">${showBase ? base.maxAltitude + ' m' : '착지 후 공개'}</td>
            <td class="py-1.5 px-2.5 font-bold">${showBase ? base.flightDistance + ' m' : '착지 후 공개'}</td>
            <td class="py-1.5 px-2.5">${showBase ? base.flightTime + ' s' : '-'}</td>
            <td class="py-1.5 px-2.5 text-center"><span class="diff-badge diff-neutral">기준</span></td>
        `;
        elements.historyTableBody.appendChild(trBase);

        // 2) 1차, 2차 변경 행
        for (let stepIdx = 1; stepIdx <= 2; stepIdx++) {
            const rec = experiment.changeRecords.find(r => r.step === stepIdx);
            const tr = document.createElement('tr');
            const labelColor = stepIdx === 1 ? '#fbbf24' : '#f472b6';

            if (!rec) {
                tr.innerHTML = `
                    <td class="py-1.5 px-2.5 font-extrabold" style="color:${labelColor}">${stepIdx}차 변경</td>
                    <td class="py-1.5 px-2.5 font-sans text-slate-400">발사 착지 후 공개</td>
                    <td class="py-1.5 px-2.5 text-slate-400">-</td>
                    <td class="py-1.5 px-2.5 text-slate-400">-</td>
                    <td class="py-1.5 px-2.5 text-slate-400">-</td>
                    <td class="py-1.5 px-2.5 text-center"><span class="diff-badge diff-neutral">대기</span></td>
                `;
            } else {
                const dAlt = rec.newMetrics.maxAltitude - base.maxAltitude;
                const dDist = rec.newMetrics.flightDistance - base.flightDistance;
                const signA = dAlt >= 0 ? '+' : '';
                const signD = dDist >= 0 ? '+' : '';
                const isImproved = dDist > 0.05 || (Math.abs(dDist) <= 0.05 && dAlt > 0.05);

                const altBadge = Math.abs(dAlt) < 0.02 ? '0.0m' : `${signA}${dAlt.toFixed(1)}m`;
                const distBadge = Math.abs(dDist) < 0.02 ? '0.0m' : `${signD}${dDist.toFixed(1)}m`;

                tr.innerHTML = `
                    <td class="py-1.5 px-2.5 font-extrabold" style="color:${labelColor}">${stepIdx}차 변경</td>
                    <td class="py-1.5 px-2.5 font-sans font-bold text-slate-100">${rec.varLabel} (${rec.oldVal}➔${rec.newVal}${rec.unit})</td>
                    <td class="py-1.5 px-2.5 font-bold">${rec.newMetrics.maxAltitude}m <span class="${dAlt >= 0 ? 'text-emerald-300' : 'text-rose-300'}">(${altBadge})</span></td>
                    <td class="py-1.5 px-2.5 font-bold">${rec.newMetrics.flightDistance}m <span class="${dDist >= 0 ? 'text-emerald-300' : 'text-rose-300'}">(${distBadge})</span></td>
                    <td class="py-1.5 px-2.5">${rec.newMetrics.flightTime}s</td>
                    <td class="py-1.5 px-2.5 text-center">
                        <span class="diff-badge ${isImproved ? 'diff-up' : 'diff-down'}">${isImproved ? '개선' : '악화'}</span>
                    </td>
                `;
            }
            elements.historyTableBody.appendChild(tr);
        }
    }

    function syncCompletedTrajectoriesToRenderer() {
        const list = [
            {
                name: '초기값(기준)',
                color: '#94a3b8',
                isBaseline: true,
                sim: experiment.baselineSim
            }
        ];

        experiment.changeRecords.forEach(rec => {
            list.push({
                name: `${rec.step}차(${rec.varLabel} ${rec.newVal}${rec.unit})`,
                color: rec.step === 1 ? '#fbbf24' : '#f472b6',
                isBaseline: false,
                sim: rec.sim
            });
        });

        renderer.setHistoryTrajectories(list);
    }

    // 8. 발사 및 착지 완료 이벤트 처리
    elements.btnLaunch.addEventListener('click', () => {
        if (simulator.isPlaying) return;

        const currentRaw = getCurrentRawValues();
        const params = rawValuesToPhysicsParams(currentRaw);
        const sim = simulator.loadSimulation(params, false);

        if (experiment.completedChanges < 2 && experiment.activeVarKey) {
            const key = experiment.activeVarKey;
            const oldVal = VAR_META[key].defaultVal;
            const newVal = currentRaw[key];
            if (Math.abs(newVal - oldVal) > 1e-4) {
                experiment.pendingLaunchRecord = {
                    step: experiment.completedChanges + 1,
                    varKey: key,
                    varLabel: VAR_META[key].label,
                    unit: VAR_META[key].unit,
                    oldVal,
                    newVal,
                    rawValues: { ...currentRaw },
                    newMetrics: { ...sim.metrics },
                    sim
                };
            } else {
                experiment.pendingLaunchRecord = null;
            }
        } else {
            experiment.pendingLaunchRecord = null;
        }

        maskResultCards('비행 측정 중...');
        renderer.camera.mode = 'auto';
        simulator.start();
        elements.btnPause.textContent = '⏸ 일시정지';
        updateExperimentLockUI();
    });

    simulator.onFinishCallback = (finishedSim) => {
        elements.btnPause.textContent = '▶ 다시보기';
        experiment.baselineRevealed = true;

        if (experiment.pendingLaunchRecord) {
            const rec = experiment.pendingLaunchRecord;
            experiment.pendingLaunchRecord = null;
            experiment.changeRecords.push(rec);
            experiment.completedChanges = rec.step;
            experiment.activeVarKey = null;

            // 1회 변수 조정 및 착지 완료 시 변수 설정값을 다시 초기값으로 복귀
            if (experiment.completedChanges === 1) {
                applyRawValuesToSliders(getDefaultRawValues());
            }
        }

        syncCompletedTrajectoriesToRenderer();
        renderer.setFlightState(true, true);
        renderer.fitAllTrajectories(finishedSim);
        renderer.render(
            finishedSim.trajectory[finishedSim.trajectory.length - 1],
            finishedSim,
            finishedSim.trajectory.length - 1
        );

        revealResultCards(finishedSim.metrics);
        renderHistoryTable();
        updateAnalysisBanner();
        updateExperimentLockUI();
    };

    // 9. 실시간 비행 계기판 콜백
    simulator.onUpdateCallback = (pt, currentTime) => {
        if (!pt) return;
        elements.hudTime.textContent = `${currentTime.toFixed(2)} s`;
        elements.hudAlt.textContent = `${pt.y.toFixed(1)} m`;
        elements.hudDist.textContent = `${pt.x.toFixed(1)} m`;
        elements.hudVel.textContent = `${pt.v.toFixed(1)} m/s`;
        elements.hudWater.textContent = `${pt.waterVolumeMl.toFixed(0)} mL`;
    };

    // 10. 실험 전체 초기화
    function resetExperiment() {
        simulator.pause();
        const defRaw = getDefaultRawValues();
        applyRawValuesToSliders(defRaw);

        experiment.completedChanges = 0;
        experiment.activeVarKey = null;
        experiment.pendingLaunchRecord = null;
        experiment.baselineRevealed = false;
        experiment.baselineSim = RocketPhysics.simulate(rawValuesToPhysicsParams(defRaw));
        experiment.changeRecords = [];

        renderer.clearHistory();
        syncCompletedTrajectoriesToRenderer();

        hidePredictionBeforeLaunch();
        updateExperimentLockUI();
        updateAnalysisBanner();
        renderHistoryTable();
    }

    elements.btnResetExperiment.addEventListener('click', resetExperiment);

    elements.btnPause.addEventListener('click', () => {
        if (!simulator.isStarted) return;
        simulator.togglePlay();
        elements.btnPause.textContent = simulator.isPlaying ? '⏸ 일시정지' : '▶ 계속';
        updateExperimentLockUI();
    });

    elements.btnReset.addEventListener('click', () => {
        simulator.reset();
        elements.btnPause.textContent = '⏸ 일시정지';
        updateExperimentLockUI();
    });

    elements.speedButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.speedButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            simulator.setSpeed(parseFloat(btn.dataset.speed));
        });
    });

    // 카메라 제어
    elements.btnCamAuto.addEventListener('click', () => {
        renderer.setCameraMode('auto', simulator.fullSim?.trajectory[simulator.currentIndex]);
    });
    elements.btnCamFit.addEventListener('click', () => {
        renderer.setCameraMode('fit', null, simulator.fullSim);
    });
    elements.btnCamReset.addEventListener('click', () => {
        renderer.camera.x = 0;
        renderer.camera.y = 0;
        renderer.camera.scale = 10.5;
        renderer.camera.mode = 'auto';
    });

    // 차트 탭 전환 (삼각형 기호 제거 & 글자 잘림 방지)
    elements.tabSpeedAlt.addEventListener('click', () => {
        elements.tabSpeedAlt.classList.add('active');
        elements.tabThrustPressure.classList.remove('active');
        elements.kineticsChartTitle.textContent = '📈 속도 · 고도 변화';
        elements.kineticsLegendBar.innerHTML = `
            <span class="text-rose-300">● 속력(v)</span>
            <span class="text-purple-300">● 고도(h)</span>
        `;
        elements.kineticsGraphCaption.innerHTML = `
            💡 발사 직후 <strong class="text-rose-300">반작용 추력으로 최고 속력 도달</strong> ➔ 비행 중 <strong class="text-slate-300">중력·공기저항 감속</strong> ➔ <strong class="text-purple-300">최고 고도 후 착지</strong>
        `;
        kineticsChart.options.datasets = [
            { key: 'v', label: '속력(v)', color: '#fb7185', unit: 'm/s', lineWidth: 2.2 },
            { key: 'y', label: '고도(h)', color: '#c084fc', unit: 'm', lineWidth: 2.2 }
        ];
        kineticsChart.setData(
            simulator.fullSim ? simulator.fullSim.trajectory : [],
            simulator.isStarted,
            simulator.isFinished
        );
    });

    elements.tabThrustPressure.addEventListener('click', () => {
        elements.tabThrustPressure.classList.add('active');
        elements.tabSpeedAlt.classList.remove('active');
        elements.kineticsChartTitle.textContent = '📈 추력 · 압력 변화';
        elements.kineticsLegendBar.innerHTML = `
            <span class="text-sky-300">● 추력(F)</span>
            <span class="text-amber-300">● 내부압력(P)</span>
        `;
        elements.kineticsGraphCaption.innerHTML = `
            💡 발사 초기(0~0.15초) <strong class="text-sky-300">단열 팽창 분출로 최대 추력 발생</strong> ➔ 분출 완료 후 <strong class="text-amber-300">내부 압력이 대기압(1bar)으로 감소</strong>
        `;
        kineticsChart.options.datasets = [
            { key: 'thrust', label: '추력(F)', color: '#38bdf8', unit: 'N', lineWidth: 2.2 },
            { key: 'pressureBar', label: '압력(P)', color: '#fbbf24', unit: 'bar', lineWidth: 2.2 }
        ];
        kineticsChart.setData(
            simulator.fullSim ? simulator.fullSim.trajectory : [],
            simulator.isStarted,
            simulator.isFinished
        );
    });

    elements.chkOverlayHistory.addEventListener('change', (e) => {
        renderer.showHistory = e.target.checked;
    });

    // 11. 초기 진입 2단계 팝업 모달 제어
    if (elements.btnModalNext) {
        elements.btnModalNext.addEventListener('click', () => {
            elements.modalStep1.classList.add('hidden');
            elements.modalStep2.classList.remove('hidden');
        });
    }
    if (elements.btnModalClose) {
        elements.btnModalClose.addEventListener('click', () => {
            elements.introModal.classList.add('hidden');
            renderer.resize();
            energyChart.resize();
            kineticsChart.resize();
        });
    }

    // 12. 초기 상태 시작
    resetExperiment();
});
