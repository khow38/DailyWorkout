import portraits from "../assets/portrait-thumbnails.json";
import {
  normalizeAppearance,
  STYLE_PRESETS,
  HAIRSTYLES,
  APPEARANCE_LIMITS,
  FACE_SHAPES,
} from "./appearance.js";

const sections = [
  ["presets", "프리셋"],
  ["face", "얼굴"],
  ["hair", "헤어"],
  ["style", "스타일"],
  ["body", "체형"],
];
const faces = [
  ["faceLength", "얼굴 길이", "짧게", "길게"],
  ["faceWidth", "얼굴 너비", "좁게", "넓게"],
  ["eyeOpenness", "눈 뜨임", "차분하게", "또렷하게"],
  ["lipFullness", "입술 볼륨", "얇게", "도톰하게"],
  ["browThickness", "눈썹 두께", "가늘게", "짙게"],
  ["noseLength", "코 길이", "짧게", "길게"],
  ["softness", "인상의 부드러움", "또렷하게", "부드럽게"],
  ["jaw", "턱 너비", "갸름하게", "넓게"],
  ["chin", "턱 길이", "짧게", "길게"],
  ["cheeks", "광대 너비", "좁게", "넓게"],
  ["eyeSize", "눈 크기", "작게", "크게"],
  ["eyeSpacing", "눈 사이 간격", "가깝게", "넓게"],
  ["eyeTilt", "눈꼬리", "내리기", "올리기"],
  ["noseBridge", "콧대", "낮게", "높게"],
  ["noseWidth", "코 너비", "좁게", "넓게"],
  ["mouthWidth", "입 너비", "좁게", "넓게"],
  ["browLift", "눈썹 높이", "낮게", "높게"],
];
function range(key, label, left, right, value, limits, attribute = "look") {
  return `<label class="studio-range"><span>${label}<output data-${attribute}-output="${key}">${Math.round(value * 100)}</output></span><input type="range" data-${attribute}="${key}" min="${limits[0]}" max="${limits[1]}" step="0.01" value="${value}"><small><span>${left}</span><span>${right}</span></small></label>`;
}
function color(key, label, value) {
  return `<label class="studio-color"><input type="color" data-look="${key}" value="${value}" aria-label="${label}"><span>${label}</span><span class="studio-color-code" data-color-code="${key}">${value.toUpperCase()}</span></label>`;
}
export function presetPortrait(model, id) {
  return portraits[model === "female" ? "female" : "male"][id];
}

export function creatorFields(body) {
  const a = normalizeAppearance(body.appearance, body.model);
  return `<div class="studio-customization"><fieldset class="studio-models"><legend>베이스 모델</legend><div>${[
    ["male", "남성"],
    ["female", "여성"],
  ]
    .map(
      ([id, label]) =>
        `<button type="button" data-model="${id}" aria-pressed="${body.model === id}">${label}</button>`,
    )
    .join(
      "",
    )}</div><small>베이스를 바꿔도 입력한 키·체형과 외모 설정은 유지됩니다.</small></fieldset><div class="studio-tabs" role="tablist" aria-label="캐릭터 꾸미기">${sections.map(([id, label], i) => `<button type="button" role="tab" id="studio-tab-${id}" aria-controls="studio-panel-${id}" aria-selected="${!i}" data-studio-tab="${id}">${label}</button>`).join("")}</div><div class="studio-panels">
  <section class="studio-panel" id="studio-panel-presets" role="tabpanel" aria-labelledby="studio-tab-presets"><div class="studio-section-title"><span>01 / START WITH A LOOK</span><h3>마음에 드는 인상부터.</h3><p>스타일을 고른 뒤 세부 외모를 조절하세요. 입력한 키와 체형은 유지됩니다.</p></div><div class="studio-presets">${STYLE_PRESETS.map((p, i) => `<button type="button" class="studio-preset" data-look-preset="${p.id}" aria-pressed="${a.preset === p.id}" style="--preset-accent:${p.accent}"><img data-preset-portrait="${p.id}" src="${presetPortrait(body.model, p.id)}" alt="" width="84" height="118"><span class="preset-index">0${i + 1}<span>↗</span></span><strong>${p.name}</strong><small>${p.caption}</small></button>`).join("")}</div><div class="studio-tip"><span>YOUR FORM, YOUR CHARACTER</span><p>얼굴 조형과 헤어를 함께 맞춘 스타일입니다. 얼굴 탭에서 기본 얼굴형만 바꿀 수도 있습니다.</p></div></section>
  <section class="studio-panel" id="studio-panel-face" role="tabpanel" aria-labelledby="studio-tab-face" hidden><div class="studio-section-title"><span>02 / FACE DETAILS</span><h3>얼굴형부터 고르세요.</h3><p>기본 조형을 선택하고 아래에서 비율을 다듬으세요.</p></div><div class="face-shapes">${FACE_SHAPES.map((f) => `<button type="button" data-face-shape="${f.id}" aria-pressed="${a.faceShape === f.id}"><strong>${f.name}</strong><small>${f.detail}</small></button>`).join("")}</div><div class="studio-sliders">${faces.map(([k, label, left, right]) => range(k, label, left, right, a[k], APPEARANCE_LIMITS[k])).join("")}</div>${color("eyeColor", "눈동자", a.eyeColor)}${color("lipColor", "입술", a.lipColor)}</section>
  <section class="studio-panel" id="studio-panel-hair" role="tabpanel" aria-labelledby="studio-tab-hair" hidden><div class="studio-section-title"><span>03 / HAIR DESIGN</span><h3>분위기를 바꾸는 헤어.</h3></div><div class="studio-options">${HAIRSTYLES.map(([id, label]) => `<button type="button" data-hair="${id}" aria-pressed="${a.hair === id}"><span class="hair-glyph hair-${id}" aria-hidden="true"></span><span>${label}</span></button>`).join("")}</div>${range("hairVolume", "헤어 볼륨", "차분하게", "풍성하게", a.hairVolume, APPEARANCE_LIMITS.hairVolume)}${color("hairColor", "헤어 컬러", a.hairColor)}</section>
  <section class="studio-panel" id="studio-panel-style" role="tabpanel" aria-labelledby="studio-tab-style" hidden><div class="studio-section-title"><span>04 / FINISHING TOUCHES</span><h3>운동할 때도, 내 스타일.</h3></div><label class="studio-select">상의 스타일<select data-look="outfit"><option value="tee" ${a.outfit === "tee" ? "selected" : ""}>트레이닝 티</option><option value="tank" ${a.outfit === "tank" ? "selected" : ""}>슬리브리스</option><option value="longsleeve" ${a.outfit === "longsleeve" ? "selected" : ""}>롱 슬리브</option></select></label>${color("topColor", "상의", a.topColor)}${color("bottomColor", "하의", a.bottomColor)}${color("shoeColor", "슈즈", a.shoeColor)}<label class="studio-select">이어 스터드<select data-look="earrings"><option value="none" ${a.earrings === "none" ? "selected" : ""}>없음</option><option value="silver" ${a.earrings === "silver" ? "selected" : ""}>실버</option><option value="gold" ${a.earrings === "gold" ? "selected" : ""}>골드</option></select></label></section>
  <section class="studio-panel" id="studio-panel-body" role="tabpanel" aria-labelledby="studio-tab-body" hidden><div class="studio-section-title"><span>05 / BODY PROPORTIONS</span><h3>내 체형에 맞게.</h3><p>입력값을 반영한 참고용 모델입니다.</p></div><div class="body-numbers">${[
    ["height", "키 (cm)", 140, 210],
    ["weight", "몸무게 (kg)", 40, 160],
  ]
    .map(
      ([k, label, min, max]) =>
        `<label>${label}<input type="number" data-body="${k}" min="${min}" max="${max}" value="${body[k]}" inputmode="decimal"></label>`,
    )
    .join("")}</div>${[
    ["shoulders", "어깨 너비", "좁게", "넓게", [0.85, 1.18]],
    ["waist", "허리 둘레", "가늘게", "두껍게", [0.8, 1.25]],
    ["hips", "골반 너비", "좁게", "넓게", [0.85, 1.2]],
    ["chest", "가슴·흉곽 볼륨", "작게", "크게", [0.88, 1.14]],
    ["legs", "다리 비율", "짧게", "길게", [0.94, 1.06]],
  ]
    .map(([k, label, left, right, limits]) =>
      range(k, label, left, right, body[k], limits, "body"),
    )
    .join(
      "",
    )}<label class="studio-color"><input type="color" data-body="skin" value="${body.skin}" aria-label="피부 톤"><span>피부 톤</span></label></section>
  </div><div class="studio-footer-note">설정은 이 브라우저에 저장됩니다.</div></div>`;
}
