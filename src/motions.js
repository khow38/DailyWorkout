import { radians as rad } from "./kinematics.js";

export const EXERCISES = Object.freeze({
  kneepush: "push",
  pushup: "push",
  closepush: "push",
  archer: "push",
  planchepush: "push",
  partialpike: "pike",
  pike: "pike",
  slowpike: "pike",
  onepike: "pike",
  hang: "pull",
  scappull: "pull",
  pullup: "pull",
  chestpull: "pull",
  wraise: "back",
  angel: "back",
  pulldown: "back",
  pausepull: "back",
  support: "dip",
  dip: "dip",
  slowdip: "dip",
  quarter: "squat",
  squat: "squat",
  split: "squat",
  pistol: "squat",
  bridge: "bridge",
  singlebridge: "bridge",
  walkout: "bridge",
  calf: "calf",
  singlecalf: "calf",
  slowcalf: "calf",
  tuck: "core",
  hollow: "core",
  longhollow: "core",
  frogprep: "balance",
  frog: "balance",
  crow: "balance",
  compression: "lsit",
  tucklsit: "lsit",
  lsit: "lsit",
  wrist: "wrist",
  march: "march",
  child: "child",
  hipstretch: "hipstretch",
});
const holds = new Set([
  "hang",
  "support",
  "tuck",
  "hollow",
  "longhollow",
  "frog",
  "crow",
  "tucklsit",
  "lsit",
  "child",
  "hipstretch",
]);
const hints = {
  push: ["내려가기 · 팔꿈치를 뒤로", "밀어 올리기 · 몸통을 일직선으로"],
  pike: ["머리를 손 사이로 낮추기", "바닥을 밀어 어깨 펴기"],
  pull: ["어깨를 내리고 당기기", "반동 없이 천천히 내려오기"],
  back: ["팔을 들고 견갑 움직이기", "허리를 꺾지 않고 돌아오기"],
  dip: ["팔꿈치를 굽혀 내려가기", "손으로 바를 밀어 올라오기"],
  squat: ["엉덩이를 낮추기 · 무릎은 발 방향", "발 전체로 바닥을 밀기"],
  bridge: ["엉덩이를 들어 올리기", "허리를 꺾지 않고 낮추기"],
  calf: ["발 앞쪽으로 지지하며 뒤꿈치 들기", "뒤꿈치를 천천히 내리기"],
  balance: ["손으로 바닥을 밀며 체중 이동", "시선은 손 앞 · 어깨 지지 유지"],
  lsit: ["골반을 세우고 다리 들기", "어깨를 내려 지지 유지"],
  wrist: ["손바닥을 붙이고 앞으로 이동", "편안한 범위에서 돌아오기"],
  march: ["한쪽 무릎을 들며 팔 돌리기", "반대쪽으로 체중 옮기기"],
};
export function motionInfo(id) {
  const family = EXERCISES[id];
  if (!family) throw new Error("Unknown exercise: " + id);
  return {
    family,
    hold: holds.has(id),
    duration: id.startsWith("slow") ? 8 : holds.has(id) ? 6 : 6,
    floor:
      ["push", "back", "bridge", "core", "wrist", "child", "balance"].includes(
        family,
      ) || id === "compression",
    equipment:
      family === "pull"
        ? "bar"
        : family === "dip" || ["tucklsit", "lsit"].includes(id)
          ? "dip"
          : "none",
  };
}

// End-effector trajectories are authored per movement. IK solves the articulated
// limbs from these contacts; it never interpolates an arbitrary stick figure.
export function sampleMotion(id, phase, m) {
  const info = motionInfo(id),
    s = m.scale,
    pi = Math.PI;
  phase = ((phase % 1) + 1) % 1;
  let u = (1 - Math.cos(phase * 2 * pi)) / 2;
  if (id.startsWith("slow")) {
    const t = phase < 0.65 ? phase / 0.65 : (1 - phase) / 0.35;
    u = t * t * (3 - 2 * t);
  }
  if (id === "pausepull") u = Math.min(1, u * 1.7);
  const p = {
    root: [0, m.hip, 0],
    pitch: 0,
    ends: {},
    equipment: info.equipment,
    barHeight: 2.12 * s,
    phaseLabel: info.hold
      ? "자세 유지 · 편안하게 호흡"
      : (hints[info.family] || ["움직임 시작", "돌아오기"])[
          phase < 0.5 ? 0 : 1
        ],
  };
  const arm = (side, target, pole, opt = {}) =>
    (p.ends["arm_" + side] = { target, pole, ...opt });
  const leg = (side, target, pole, opt = {}) =>
    (p.ends["leg_" + side] = { target, pole, ...opt });
  const both = (fn) => {
    fn("l", 1);
    fn("r", -1);
  };
  const groundHand = {
    surface: 0,
    anchor: true,
    fingers: [0, 0, 1],
    normal: [0, -1, 0],
  };
  const groundFoot = { surface: 0, anchor: true, pitch: 0 };
  const freeHand = { fingers: [0, -1, 0], normal: [0, 0, -1] };
  const a = m.arm,
    l = m.leg,
    hx = m.hipX,
    sx = m.shoulderX;
  switch (info.family) {
    case "push": {
      let hy = (0.4 - 0.11 * u) * s,
        az = -0.82 * s,
        ay = m.toeY,
        rz = az + Math.sqrt(Math.max(0.02, l * l - (hy + 0.02 * s - ay) ** 2));
      p.root = [id === "archer" ? 0.19 * s * u : 0, hy, rz];
      p.pitch = Math.acos(Math.min(0.99, (hy + 0.02 * s - ay) / l));
      if (id === "planchepush") p.root[2] += 0.08 * s;
      if (id === "kneepush") {
        hy = (0.34 - 0.16 * u) * s;
        const ky = 0.055 * s,
          kz = -0.28 * s;
        p.root = [
          0,
          hy,
          kz +
            Math.sqrt(
              Math.max(0.01, m.thigh * m.thigh - (hy + 0.02 * s - ky) ** 2),
            ),
        ];
        p.pitch = Math.acos(Math.min(0.99, (hy + 0.02 * s - ky) / m.thigh));
        both((side, n) =>
          leg(
            side,
            [n * hx, ky + m.shin * 0.55, kz - m.shin * 0.835],
            [n * hx, ky, kz],
            { pitch: rad(100) },
          ),
        );
      } else {
        p.lineToFeet = true;
        both((side, n) =>
          leg(side, [n * hx, ay, az], [n * hx, hy - 0.1 * s, rz - 0.3 * s], {
            ...groundFoot,
            pitch: rad(70),
          }),
        );
      }
      const spread =
        id === "closepush"
          ? 0.1 * s
          : id === "archer"
            ? 0.45 * s
            : sx + 0.025 * s;
      both((side, n) =>
        arm(
          side,
          [n * spread, 0, 0.5 * s],
          [n * (spread + 0.14 * s), 0.13 * s, 0.05 * s],
          { ...groundHand, maxFlex: 115 },
        ),
      );
      break;
    }
    case "pike": {
      if (id === "partialpike") u *= 0.4;
      p.root = [0, (0.88 - 0.1 * u) * s, -0.12 * s];
      p.pitch = rad(125 + 12 * u);
      p.headPitch = p.pitch;
      both((side, n) => {
        arm(
          side,
          [n * (sx + 0.025 * s), 0, 0.33 * s],
          [n * (sx + 0.12 * s), 0.12 * s, 0.12 * s],
          groundHand,
        );
        if (id === "onepike" && side === "r")
          leg(
            side,
            [n * hx, p.root[1] + l * 0.65, p.root[2] - l * 0.75],
            [n * hx, p.root[1] + 0.2 * s, p.root[2] - 0.4 * s],
            { pitch: rad(70) },
          );
        else
          leg(side, [n * hx, 0, -0.65 * s], [n * hx, 0.5 * s, -0.42 * s], {
            ...groundFoot,
            pitch: rad(45),
          });
      });
      break;
    }
    case "squat": {
      const depth = id === "quarter" ? 0.23 : 0.45;
      p.root = [
        id === "pistol" ? hx : 0,
        m.hip - depth * s * u,
        -(0.04 + 0.2 * u) * s,
      ];
      p.pitch = rad(4 + 20 * u);
      both((side, n) => {
        const z = id === "split" ? (side === "l" ? 0.38 : -0.48) * s : 0;
        if (id === "split") {
          p.root[1] = m.hip - (0.1 + 0.34 * u) * s;
          p.root[2] = -0.08 * s;
          p.pitch = rad(7);
        }
        if (id === "pistol" && side === "r") {
          const fy = (0.14 + 0.32 * (1 - u)) * s,
            dy = p.root[1] + 0.02 * s - fy;
          leg(
            side,
            [-hx, fy, p.root[2] + Math.sqrt(Math.max(0.01, l * l - dy * dy))],
            [-hx, p.root[1], 0.65 * s],
            { pitch: rad(-25) },
          );
        } else
          leg(
            side,
            [n * (hx + 0.035 * s), 0, z],
            [n * (hx + 0.04 * s), 0.4 * s, z + 0.5 * s],
            {
              ...groundFoot,
              pitch: id === "split" && side === "r" ? rad(45) : 0,
            },
          );
        arm(
          side,
          [
            n * (sx + 0.01 * s),
            p.root[1] + Math.cos(p.pitch) * m.shoulder - 0.04 * s,
            p.root[2] + Math.sin(p.pitch) * m.shoulder + a * 0.96,
          ],
          [n * (sx + 0.02 * s), p.root[1] + 0.2 * s, 0.3 * s],
          { fingers: [0, 0, 1], normal: [0, -1, 0] },
        );
      });
      break;
    }
    case "pull": {
      const lift =
        id === "hang"
          ? 0
          : id === "scappull"
            ? 0.045 * u
            : id === "chestpull"
              ? 0.47 * u
              : 0.37 * u;
      p.root = [
        0,
        p.barHeight - m.shoulder - a + 0.025 * s + lift * s,
        id === "chestpull" ? -0.18 * s * u : -0.075 * s * u,
      ];
      p.pitch = rad(-3);
      p.scapula = -0.025 - (id === "scappull" ? 0.035 * u : 0);
      both((side, n) => {
        arm(
          side,
          [n * (sx + 0.045 * s), p.barHeight, 0],
          [n * (sx + 0.2 * s), p.root[1] + 0.2 * s, 0.1 * s],
          { anchor: true, fingers: [0, 0, -1], normal: [0, 1, 0], grip: true },
        );
        leg(
          side,
          [n * hx, p.root[1] - l * 0.91, -0.2 * s],
          [n * hx, p.root[1] - 0.38 * s, 0.06 * s],
          { pitch: rad(15) },
        );
      });
      break;
    }
    case "dip": {
      const t = id === "support" ? 0 : u;
      p.barHeight = 0.98 * s;
      p.root = [
        0,
        p.barHeight + a - m.shoulder + 0.02 * s - 0.24 * s * t,
        -0.015 * s,
      ];
      p.pitch = rad(6 + 9 * t);
      p.scapula = -0.025;
      both((side, n) => {
        arm(
          side,
          [n * (sx + 0.06 * s), p.barHeight, 0],
          [n * (sx + 0.1 * s), p.barHeight + 0.15 * s, -0.28 * s],
          { anchor: true, fingers: [-n, 0, 0], normal: [0, -1, 0], grip: true },
        );
        leg(side, [n * hx, 0.25 * s, -0.35 * s], [n * hx, 0.55 * s, 0.15 * s], {
          pitch: rad(60),
        });
      });
      break;
    }
    case "bridge": {
      let lift = u,
        z = 0.49 * s;
      if (id === "walkout") {
        lift = 0.65;
        z = (0.49 + 0.22 * u) * s;
      }
      p.root = [0, (0.13 + 0.27 * lift) * s, 0];
      p.pitch = rad(-91 - 45 * lift);
      p.headPitch = rad(-90);
      p.pelvisPitch = rad(-80);
      both((side, n) => {
        arm(
          side,
          [n * (sx + 0.05 * s), 0, 0.08 * s],
          [n * (sx + 0.08 * s), 0.1 * s, -0.08 * s],
          { ...groundHand, fingers: [0, 0, 1] },
        );
        if (id === "singlebridge" && side === "r")
          leg(
            side,
            [-hx, p.root[1] + l * 0.56, l * 0.82],
            [-hx, p.root[1] + 0.35 * s, 0.45 * s],
            { pitch: rad(-65) },
          );
        else if (id === "walkout") {
          const steps = [
              [0.49, 0.49],
              [0.61, 0.49],
              [0.61, 0.61],
              [0.73, 0.61],
              [0.73, 0.73],
              [0.61, 0.73],
              [0.61, 0.61],
              [0.49, 0.61],
              [0.49, 0.49],
            ],
            part = Math.min(7, Math.floor(phase * 8)),
            t = phase * 8 - part,
            smooth = t * t * (3 - 2 * t),
            index = side === "l" ? 0 : 1;
          const from = steps[part][index],
            to = steps[part + 1][index],
            moving = from !== to;
          leg(
            side,
            [
              n * hx,
              m.footY + (moving ? 0.025 * Math.sin(t * pi) * s : 0),
              (from + (to - from) * smooth) * s,
            ],
            [n * hx, 0.65 * s, 0.3 * s],
            moving ? { pitch: 0 } : groundFoot,
          );
        } else
          leg(side, [n * hx, 0, z], [n * hx, 0.65 * s, 0.3 * s], groundFoot);
      });
      break;
    }
    case "calf": {
      const footPitch = rad(32 * u),
        rise = 0.073 * s * u;
      p.root = [id === "singlecalf" ? hx : 0, m.hip + rise, 0];
      both((side, n) => {
        if (id === "singlecalf" && side === "r")
          leg(side, [-hx, 0.28 * s, -0.18 * s], [-hx, 0.55 * s, 0.2 * s], {
            pitch: rad(25),
          });
        else
          leg(side, [n * hx, 0, 0], [n * hx, 0.5 * s, 0.2 * s], {
            ...groundFoot,
            pitch: footPitch,
          });
        arm(
          side,
          [n * (sx + 0.055 * s), p.root[1] + m.shoulder - a * 0.96, 0.02 * s],
          [n * (sx + 0.1 * s), p.root[1] + 0.15 * s, 0.07 * s],
          freeHand,
        );
      });
      break;
    }
    case "core": {
      p.root = [0, 0.14 * s, 0];
      p.pitch = rad(-75);
      p.pelvisPitch = rad(-90);
      p.headPitch = rad(-65);
      both((side, n) => {
        const tucked = id === "tuck";
        leg(
          side,
          [n * hx, (tucked ? 0.38 : 0.24) * s, (tucked ? 0.52 : 0.84) * s],
          [n * hx, 0.65 * s, 0.35 * s],
          { pitch: rad(-70) },
        );
        const overhead = id === "longhollow";
        arm(
          side,
          [
            n * (sx + 0.025 * s),
            (overhead ? 0.26 : 0.22) * s,
            (overhead ? -0.95 : 0.08) * s,
          ],
          [n * (sx + 0.07 * s), 0.24 * s, (overhead ? -0.65 : -0.15) * s],
          { fingers: [0, 0, overhead ? -1 : 1], normal: [0, -1, 0] },
        );
      });
      break;
    }
    case "back": {
      p.root = [0, 0.13 * s, 0];
      p.pitch = rad(90);
      p.headPitch = rad(90);
      both((side, n) => {
        leg(side, [n * hx, 0.09 * s, -l], [n * hx, 0.14 * s, -0.4 * s], {
          pitch: rad(90),
        });
        if (id === "angel") {
          const theta = 0.15 + (pi - 0.35) * u;
          arm(
            side,
            [
              n * (sx + Math.sin(theta) * a * 0.96),
              (0.1 + 0.025 * Math.sin(theta)) * s,
              m.shoulder + Math.cos(theta) * a * 0.96,
            ],
            [n * (sx + 0.3 * s), 0.15 * s, m.shoulder + 0.1 * s],
            {
              fingers: [n * Math.sin(theta), 0, Math.cos(theta)],
              normal: [0, -1, 0],
            },
          );
        } else {
          const t = id === "wraise" ? 1 : u;
          arm(
            side,
            [
              n * (0.23 + 0.15 * t) * s,
              (0.1 + 0.065 * (id === "wraise" ? u : t)) * s,
              (0.95 - 0.43 * t) * s,
            ],
            [n * 0.47 * s, 0.13 * s, 0.32 * s],
            { fingers: [0, 0, 1], normal: [0, -1, 0] },
          );
        }
      });
      break;
    }
    case "lsit": {
      const floor = id === "compression";
      p.barHeight = 0.85 * s;
      p.root = [
        0,
        floor ? 0.12 * s : p.barHeight + a - m.shoulder + 0.035 * s,
        0,
      ];
      p.pitch = rad(floor ? 8 : 0);
      p.scapula = -0.03;
      both((side, n) => {
        arm(
          side,
          [n * (sx + 0.06 * s), floor ? 0 : p.barHeight, floor ? 0.08 * s : 0],
          [n * (sx + 0.13 * s), p.root[1] + 0.16 * s, -0.08 * s],
          floor
            ? groundHand
            : {
                anchor: true,
                fingers: [-n, 0, 0],
                normal: [0, -1, 0],
                grip: true,
              },
        );
        const tucked = id === "tucklsit";
        leg(
          side,
          [
            n * hx,
            floor
              ? (0.1 + 0.08 * u) * s
              : p.root[1] + (tucked ? -0.03 : 0.02) * s,
            tucked ? 0.36 * s : l * 0.9999 + 0.007 * s,
          ],
          [n * hx, p.root[1] + 0.4 * s, 0.35 * s],
          { pitch: rad(-75) },
        );
      });
      break;
    }
    case "balance": {
      const prep = id === "frogprep";
      p.root = [
        0,
        (id === "crow" ? 0.73 : prep ? 0.55 : 0.66) * s,
        (-0.09 + (prep ? 0.04 * u : 0)) * s,
      ];
      p.pitch = rad(id === "crow" ? 126 : 116);
      p.headPitch = rad(102);
      both((side, n) => {
        arm(
          side,
          [n * (sx + 0.01 * s), 0, 0.37 * s],
          [n * (sx + 0.035 * s), 0.24 * s, 0.18 * s],
          groundHand,
        );
        leg(
          side,
          [n * (hx + 0.045 * s), prep ? 0 : 0.28 * s, -0.28 * s],
          [n * (sx + 0.015 * s), 0.32 * s, 0.17 * s],
          prep ? { ...groundFoot, pitch: rad(65) } : { pitch: rad(100) },
        );
      });
      break;
    }
    case "wrist": {
      p.root = [0, 0.48 * s, (-0.1 + 0.045 * u) * s];
      p.pitch = rad(85);
      p.headPitch = rad(70);
      both((side, n) => {
        arm(
          side,
          [n * sx, 0, 0.41 * s],
          [n * (sx + 0.08 * s), 0.2 * s, 0.2 * s],
          groundHand,
        );
        const knee = [n * hx, 0.065 * s, -0.22 * s];
        leg(
          side,
          [
            n * hx,
            0.09 * s,
            -0.22 * s - Math.sqrt(m.shin * m.shin - (0.025 * s) ** 2),
          ],
          knee,
          { pitch: rad(115), jointContact: knee },
        );
      });
      break;
    }
    case "march": {
      const wave = Math.sin(2 * pi * phase);
      p.root = [-0.025 * s * wave, m.hip, 0];
      both((side, n) => {
        const lift = Math.max(0, n * wave);
        leg(
          side,
          [n * hx, lift * 0.23 * s, lift * 0.15 * s],
          [n * hx, 0.55 * s, 0.32 * s],
          lift > 0.01 ? { pitch: 0 } : groundFoot,
        );
        const angle = phase * 2 * pi;
        arm(
          side,
          [
            n * (sx + a * 0.96),
            m.hip + m.shoulder + 0.085 * s * Math.cos(angle),
            0.085 * s * Math.sin(angle),
          ],
          [n * (sx + 0.24 * s), m.hip + m.shoulder, 0.05 * s],
          { fingers: [n, 0, 0], normal: [0, -1, 0] },
        );
      });
      break;
    }
    case "child": {
      p.root = [0, 0.35 * s, -0.42 * s];
      p.pitch = rad(114);
      p.headPitch = rad(90);
      both((side, n) => {
        arm(
          side,
          [n * sx, 0, 0.48 * s],
          [n * (sx + 0.03 * s), 0.12 * s, 0.15 * s],
          groundHand,
        );
        const knee = [n * hx, 0.065 * s, -0.12 * s];
        leg(
          side,
          [
            n * hx,
            0.09 * s,
            -0.12 * s - Math.sqrt(m.shin * m.shin - (0.025 * s) ** 2),
          ],
          knee,
          { pitch: rad(115), jointContact: knee },
        );
      });
      break;
    }
    case "hipstretch": {
      p.root = [0, 0.48 * s, -0.2 * s];
      p.pitch = rad(3);
      both((side, n) => {
        const front = side === "l";
        leg(
          side,
          [n * hx, 0, (front ? 0.37 : -0.67) * s],
          [n * hx, front ? 0.4 * s : 0.055 * s, (front ? 0.37 : -0.2) * s],
          { ...groundFoot, pitch: front ? 0 : rad(110) },
        );
        arm(
          side,
          [n * (sx + 0.02 * s), 0.52 * s, 0.05 * s],
          [n * (sx + 0.1 * s), 0.65 * s, -0.03 * s],
          { fingers: [0, -1, 0], normal: [0, 0, -1] },
        );
      });
      break;
    }
  }
  return p;
}
