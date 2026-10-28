/**
 * Water Rocket Physics Engine
 * 화학: 보일의 법칙, 열역학 제1법칙(단열 팽창), 수온별 포화 증기압
 * 물리: 작용-반작용(추력), 노즐 유출, 공기저항, 포물선 탄도 궤적 및 에너지 보존
 */

class RocketPhysics {
    static CONSTANTS = {
        G: 9.80665,            // 중력가속도 (m/s^2)
        P_ATM: 101325,         // 대기압 (Pa)
        R_SPECIFIC_AIR: 287.05,// 공기 기체상수 (J/(kg*K))
        GAMMA: 1.4,            // 공기 비열비 (Cp/Cv, 단열지수)
        RHO_AIR_AMB: 1.225,    // 상온 대기 밀도 (kg/m^3)
        WATER_CD: 0.98,        // 노즐 유출계수 (물)
        AIR_CD: 0.82,          // 노즐 유출계수 (공기)
        ROCKET_CD: 0.35,       // 로켓 공기저항 계수 (유선형 노즈콘+핀)
        BOTTLE_DIAMETER: 0.10, // 페트병 직경 (m, 약 10cm)
        RAIL_LENGTH: 0.60      // 발사대 가이드 레일 길이 (m)
    };

    /**
     * 수온(°C)에 따른 물의 포화 증기압 계산 (Arden Buck 방정식 변형)
     * @param {number} tempC - 수온 (°C)
     * @returns {number} 포화 증기압 (Pa)
     */
    static getSaturatedVaporPressure(tempC) {
        const T = Math.max(0, Math.min(100, tempC));
        // Tetens / Buck 공식 (kPa 단위)
        const p_kPa = 0.61121 * Math.exp((18.678 - T / 234.4) * (T / (257.14 + T)));
        return p_kPa * 1000; // Pa 반환
    }

    /**
     * 수온(°C)에 따른 물의 밀도 (kg/m^3)
     * @param {number} tempC - 수온 (°C)
     * @returns {number} 밀도 (kg/m^3)
     */
    static getWaterDensity(tempC) {
        const T = Math.max(0, Math.min(100, tempC));
        // 표준 물 밀도 근사식
        return 1000 * (1 - (T + 288.9414) / (508929.2 * (T + 68.12963)) * Math.pow(T - 3.9863, 2));
    }

    /**
     * 전체 비행 시뮬레이션을 사전 계산 (고정밀 시간간격 RK4/수치적분)
     * @param {Object} params - 발사 조건 파라미터
     * @returns {Object} 시뮬레이션 결과 (시계열 데이터, 주요 지표, 궤적)
     */
    static simulate(params) {
        const {
            waterTempC = 25,         // 수온 (°C)
            waterVolumeL = 0.6,      // 물의 부피 (L)
            airPressureBar = 5.0,    // 주입 공기 게이지 압력 (bar)
            dryMassKg = 0.15,        // 로켓 건조 질량 (kg)
            launchAngleDeg = 45,     // 발사각 (도)
            bottleVolumeL = 2.0,     // 페트병 총 부피 (L)
            nozzleDiameterM = 0.021, // 노즐 내경 (m, 표준 21mm)
            isAdiabatic = true,      // true: 단열 팽창(열역학 제1법칙), false: 보일의 법칙(등온)
            windSpeed = 0            // 맞바람/뒷바람 (m/s, 기본 0)
        } = params;

        const C = this.CONSTANTS;
        const gamma = isAdiabatic ? C.GAMMA : 1.0;

        // 단위 변환 및 초기화
        const V_bottle = bottleVolumeL * 1e-3; // m^3
        let V_water = Math.min(waterVolumeL * 1e-3, V_bottle * 0.95); // m^3
        let V_air = Math.max(1e-5, V_bottle - V_water); // m^3
        const V_air_0 = V_air;

        const rho_water = this.getWaterDensity(waterTempC);
        const P_vap = this.getSaturatedVaporPressure(waterTempC);

        // 총 초기 절대 압력 = 대기압 + 주입 게이지 압력 + 수증기 분압
        const P_gauge_Pa = airPressureBar * 1e5;
        const P_0 = C.P_ATM + P_gauge_Pa + P_vap;
        let P = P_0;

        // 초기 온도 (K)
        const T_0 = 273.15 + waterTempC;
        let T_air = T_0;

        // 초기 압축 공기 질량
        let m_air = (P_0 * V_air_0) / (C.R_SPECIFIC_AIR * T_0);

        // 면적 계산
        const A_nozzle = Math.PI * Math.pow(nozzleDiameterM / 2, 2);
        const A_bottle = Math.PI * Math.pow(C.BOTTLE_DIAMETER / 2, 2);
        const A_rocket = A_bottle; // 전면 투영 단면적

        // 초기 압축 공기에 저장된 가용 열역학적 팽창 일/에너지 (J)
        // W = (P0*V0 - Patm*Vbottle) / (gamma - 1)
        const storedThermodynamicEnergy = isAdiabatic 
            ? (P_0 * V_air_0 / (gamma - 1)) * (1 - Math.pow(V_air_0 / V_bottle, gamma - 1))
            : P_0 * V_air_0 * Math.log(V_bottle / V_air_0);

        // 발사 상태 변수
        const angleRad = (launchAngleDeg * Math.PI) / 180;
        let x = 0;
        let y = 0;
        let vx = 0;
        let vy = 0;
        let t = 0;

        let phase = 'water'; // 'water' -> 'air' -> 'ballistic'
        let waterEndTime = null;
        let thrustEndTime = null;

        // 결과 저장 버퍼
        const trajectory = [];
        let maxAltitude = 0;
        let maxVelocity = 0;
        let maxThrust = 0;
        let maxDynamicPressure = 0;

        const dt = 0.0015; // 1.5ms 정밀 적분 스텝
        const maxTime = 30.0; // 최대 시뮬레이션 시간 30초

        while (t < maxTime) {
            // 현재 질량
            const m_water = V_water * rho_water;
            const currentMass = dryMassKg + m_water + m_air;

            // 현재 속력 및 비행 각도
            const v = Math.sqrt(vx * vx + vy * vy);
            const distFromLaunch = Math.sqrt(x * x + y * y);

            // 자세 각도 (발사대 레일 구간에서는 레일 각도 구속, 레일 이탈 후에는 탄도 방향)
            let pitch;
            if (distFromLaunch < C.RAIL_LENGTH && v < 20.0) {
                pitch = angleRad;
            } else if (v > 0.1) {
                pitch = Math.atan2(vy, vx);
            } else {
                pitch = angleRad;
            }

            const dirX = Math.cos(pitch);
            const dirY = Math.sin(pitch);

            let thrust = 0;
            let mDot = 0;

            // 1. 물 분출 단계 (Water Thrust Phase)
            if (phase === 'water') {
                if (V_water > 0 && P > C.P_ATM) {
                    // 유효 차압 (게이지 압력)
                    const deltaP = Math.max(0, P - C.P_ATM);
                    // 오리피스 유출 속도 (베르누이)
                    const v_exhaust = Math.sqrt((2 * deltaP) / rho_water);
                    // 체적 유량
                    const Q_w = C.WATER_CD * A_nozzle * v_exhaust;
                    mDot = rho_water * Q_w;

                    // 작용-반작용 추력 F = mDot * v_exhaust
                    // F ≈ 2 * Cd * A_nozzle * deltaP
                    thrust = 2 * C.WATER_CD * A_nozzle * deltaP;

                    // 상태 업데이트
                    V_water -= Q_w * dt;
                    if (V_water <= 0) {
                        V_water = 0;
                        V_air = V_bottle;
                        phase = 'air';
                        waterEndTime = t;
                    } else {
                        V_air = V_bottle - V_water;
                    }

                    // 압력 및 온도 업데이트 (보일의 법칙 / 단열 팽창)
                    if (isAdiabatic) {
                        P = P_0 * Math.pow(V_air_0 / V_air, gamma);
                        T_air = T_0 * Math.pow(V_air_0 / V_air, gamma - 1);
                    } else {
                        P = P_0 * (V_air_0 / V_air);
                    }
                } else {
                    V_water = 0;
                    V_air = V_bottle;
                    phase = 'air';
                    waterEndTime = t;
                }
            }
            // 2. 고압 공기 분출 단계 (Air Thrust Phase)
            else if (phase === 'air') {
                if (P > C.P_ATM + 500 && m_air > 0.001) {
                    // 압축성 공기 노즐 유출
                    const pr = C.P_ATM / P;
                    const prCrit = Math.pow(2 / (gamma + 1), gamma / (gamma - 1)); // 약 0.528

                    let mDotAir = 0;
                    let vExhaustAir = 0;

                    if (pr <= prCrit) {
                        // 초크 흐름 (Choked Flow)
                        const factor = Math.sqrt(gamma / (C.R_SPECIFIC_AIR * T_air)) * 
                                       Math.pow(2 / (gamma + 1), (gamma + 1) / (2 * (gamma - 1)));
                        mDotAir = C.AIR_CD * A_nozzle * P * factor;
                        vExhaustAir = Math.sqrt(gamma * C.R_SPECIFIC_AIR * (2 / (gamma + 1)) * T_air);
                    } else {
                        // 아음속 흐름 (Subsonic Flow)
                        const factor = Math.sqrt(
                            (2 * gamma / (gamma - 1)) * 
                            (Math.pow(pr, 2 / gamma) - Math.pow(pr, (gamma + 1) / gamma))
                        );
                        mDotAir = C.AIR_CD * A_nozzle * P * Math.sqrt(1 / (C.R_SPECIFIC_AIR * T_air)) * factor;
                        vExhaustAir = Math.sqrt(
                            2 * (gamma / (gamma - 1)) * C.R_SPECIFIC_AIR * T_air * (1 - Math.pow(pr, (gamma - 1) / gamma))
                        );
                    }

                    thrust = mDotAir * vExhaustAir + (P - C.P_ATM) * A_nozzle;
                    m_air = Math.max(0.001, m_air - mDotAir * dt);

                    // 단열 팽창에 따른 밀도 및 압력/온도 감소
                    const rho_curr = m_air / V_bottle;
                    const rho_0_air = (P_0 * V_air_0) / (C.R_SPECIFIC_AIR * T_0) / V_bottle;
                    P = Math.max(C.P_ATM, P_0 * Math.pow(rho_curr / rho_0_air, gamma));
                    T_air = Math.max(180, T_0 * Math.pow(P / P_0, (gamma - 1) / gamma));
                } else {
                    phase = 'ballistic';
                    thrustEndTime = t;
                    thrust = 0;
                    P = C.P_ATM;
                }
            } else {
                // 3. 탄도 비행 단계
                thrust = 0;
                P = C.P_ATM;
            }

            if (thrust > maxThrust) maxThrust = thrust;

            // 공기 저항 (Drag)
            // 상대 기류 속도 (맞바람 반영)
            const vRelX = vx - windSpeed;
            const vRelY = vy;
            const vRel = Math.sqrt(vRelX * vRelX + vRelY * vRelY);

            const F_drag = 0.5 * C.RHO_AIR_AMB * C.ROCKET_CD * A_rocket * (vRel * vRel);

            // 가속도 계산
            let Fx = thrust * dirX - (vRel > 0 ? F_drag * (vRelX / vRel) : 0);
            let Fy = thrust * dirY - (vRel > 0 ? F_drag * (vRelY / vRel) : 0) - currentMass * C.G;

            // 발사대 레일 구속 처리
            if (distFromLaunch < C.RAIL_LENGTH && vy >= 0) {
                // 레일 방향 성분만 가속
                const F_parallel = Fx * Math.cos(angleRad) + Fy * Math.sin(angleRad);
                if (F_parallel > 0) {
                    Fx = F_parallel * Math.cos(angleRad);
                    Fy = F_parallel * Math.sin(angleRad);
                } else {
                    Fx = 0;
                    Fy = 0;
                }
            }

            const ax = Fx / currentMass;
            const ay = Fy / currentMass;

            // 에너지 계산
            const Ek = 0.5 * currentMass * v * v;
            const Ep = currentMass * C.G * Math.max(0, y);
            const Em = Ek + Ep;

            // 최고 지표 갱신
            if (y > maxAltitude) maxAltitude = y;
            if (v > maxVelocity) maxVelocity = v;

            // 시계열 데이터 저장 (표시 최적화를 위해 일정 간격 샘플링)
            trajectory.push({
                t: Number(t.toFixed(4)),
                x: Number(x.toFixed(3)),
                y: Number(Math.max(0, y).toFixed(3)),
                vx: Number(vx.toFixed(2)),
                vy: Number(vy.toFixed(2)),
                v: Number(v.toFixed(2)),
                ax: Number(ax.toFixed(2)),
                ay: Number(ay.toFixed(2)),
                mass: Number(currentMass.toFixed(3)),
                waterVolumeMl: Number((V_water * 1e6).toFixed(1)),
                pressureBar: Number((P / 1e5).toFixed(2)),
                thrust: Number(thrust.toFixed(1)),
                phase: phase,
                Ek: Number(Ek.toFixed(2)),
                Ep: Number(Ep.toFixed(2)),
                Em: Number(Em.toFixed(2)),
                pitchDeg: Number(((pitch * 180) / Math.PI).toFixed(1))
            });

            // 오일러-크로머 적분 (빠르고 정확)
            vx += ax * dt;
            vy += ay * dt;
            x += vx * dt;
            y += vy * dt;
            t += dt;

            // 지면 충돌 검출 (발사 시작 직후 제외)
            if (t > 0.1 && y <= 0) {
                y = 0;
                // 마지막 접지 포인트 추가
                trajectory.push({
                    t: Number(t.toFixed(4)),
                    x: Number(x.toFixed(3)),
                    y: 0,
                    vx: 0,
                    vy: 0,
                    v: 0,
                    ax: 0,
                    ay: 0,
                    mass: Number(currentMass.toFixed(3)),
                    waterVolumeMl: 0,
                    pressureBar: 1.01,
                    thrust: 0,
                    phase: 'landed',
                    Ek: 0,
                    Ep: 0,
                    Em: 0,
                    pitchDeg: 0
                });
                break;
            }
        }

        const flightDistance = Math.max(0, x);
        const flightTime = t;

        return {
            params,
            metrics: {
                maxAltitude: Number(maxAltitude.toFixed(2)),
                flightDistance: Number(flightDistance.toFixed(2)),
                flightTime: Number(flightTime.toFixed(2)),
                maxVelocity: Number(maxVelocity.toFixed(2)),
                maxThrust: Number(maxThrust.toFixed(2)),
                vaporPressureKPa: Number((P_vap / 1000).toFixed(2)),
                totalInitialPressureBar: Number((P_0 / 1e5).toFixed(2)),
                waterEndTime: waterEndTime ? Number(waterEndTime.toFixed(3)) : 0,
                thrustEndTime: thrustEndTime ? Number(thrustEndTime.toFixed(3)) : 0,
                storedEnergyJ: Number(storedThermodynamicEnergy.toFixed(1))
            },
            trajectory
        };
    }

    /**
     * 특정 변수(예: 물의 양, 공기 압력, 수온, 발사각)의 변화에 따른 민감도(고도, 거리) 일괄 계산
     * @param {string} variableName - 'waterVolumeL' | 'airPressureBar' | 'waterTempC' | 'launchAngleDeg'
     * @param {Object} baseParams - 기준 파라미터
     * @param {number} steps - 샘플링 개수
     * @returns {Array} 분석 데이터 포인트 목록
     */
    static runSensitivityAnalysis(variableName, baseParams, steps = 15) {
        const ranges = {
            waterVolumeL: { min: 0.1, max: 1.5, unit: 'L', label: '물의 양 (L)' },
            airPressureBar: { min: 2.0, max: 8.0, unit: 'bar', label: '공기 압력 (bar)' },
            waterTempC: { min: 5, max: 85, unit: '°C', label: '수온 (°C)' },
            launchAngleDeg: { min: 15, max: 80, unit: '°', label: '발사각 (°)' },
            dryMassKg: { min: 0.08, max: 0.40, unit: 'kg', label: '로켓 질량 (kg)' }
        };

        const config = ranges[variableName] || ranges.waterVolumeL;
        const stepSize = (config.max - config.min) / (steps - 1);
        const results = [];

        for (let i = 0; i < steps; i++) {
            const val = config.min + stepSize * i;
            const currentParams = { ...baseParams, [variableName]: val };
            const sim = this.simulate(currentParams);
            results.push({
                xValue: Number(val.toFixed(2)),
                label: `${Number(val.toFixed(2))} ${config.unit}`,
                maxAltitude: sim.metrics.maxAltitude,
                flightDistance: sim.metrics.flightDistance,
                maxVelocity: sim.metrics.maxVelocity
            });
        }

        return {
            variable: variableName,
            config,
            results
        };
    }
}

// 전역 등록 (브라우저 file:// 환경 호환)
if (typeof window !== 'undefined') {
    window.RocketPhysics = RocketPhysics;
}
