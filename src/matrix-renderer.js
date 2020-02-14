import * as PIXI from 'pixi.js';
// import createRegl from 'regl';

// const VS = `
//   precision mediump float;

//   attribute vec2 aPosition;

//   // index into the texture state
//   varying vec2 vTexIdx;

//   void main() {
//     // map bottom left -1,-1 (normalized device coords) to 0,0 (particle texture index)
//     // and 1,1 (ndc) to 1,1 (texture)
//     vTexIdx = 0.5 * (1.0 + aPosition);
//     gl_Position = vec4(aPosition, 0.0, 1.0);
//   }

const VS2 = `
  precision mediump float;

  uniform mat3 projectionMatrix;
  uniform mat3 translationMatrix;

  attribute vec2 aPosition;

  // index into the texture state
  varying vec2 vTexIdx;

  void main() {
    // map bottom left -1,-1 (normalized device coords) to 0,0 (particle texture index)
    // and 1,1 (ndc) to 1,1 (texture)
    vTexIdx = 0.5 * (1.0 + aPosition);
    gl_Position = vec4(
      (projectionMatrix * translationMatrix * vec3(aPosition, 1.0)).xy,
      0.0,
      1.0
    );
  }
`;

const FS = `
  precision mediump float;

  uniform sampler2D uDataTex;
  uniform float uMinValue;
  uniform float uMaxValue;
  uniform sampler2D uColorMapTex;
  uniform float uColorMapRes;

  varying vec2 vTexIdx;

  vec3 toColor(float value) {
    // Linear index into the colormap, e.g., 5 means the 5th color
    float linIdx = (value - uMinValue) / uMaxValue * uColorMapRes * uColorMapRes;
    // Texture index into the colormap texture
    vec2 texIdx = vec2(
      (mod(linIdx, uColorMapRes) / uColorMapRes),
      (floor(linIdx / uColorMapRes) / uColorMapRes)
    );
    return texture2D(uColorMapTex, texIdx).xyz;
  }

  void main() {
    float value = texture2D(uDataTex, vTexIdx).x;
    gl_FragColor = vec4(toColor(value), 1.0);
  }
`;

// const createColorTexture = (regl, colors) => {
//   const colorTexRes = Math.max(2, Math.ceil(Math.sqrt(colors.length)));
//   const rgba = new Float32Array(colorTexRes ** 2 * 4);
//   colors.forEach((color, i) => {
//     rgba[i * 4] = color[0]; // r
//     rgba[i * 4 + 1] = color[1]; // g
//     rgba[i * 4 + 2] = color[2]; // b
//     rgba[i * 4 + 3] = color[3]; // a
//   });

//   return [
//     regl.texture({
//       data: rgba,
//       shape: [colorTexRes, colorTexRes, 4],
//       type: 'float'
//     }),
//     colorTexRes
//   ];
// };

// const createMatrixRenderer = ({
//   colorMap,
//   shape: dataShape,
//   minValue = 0,
//   maxValue = 1
// }) => sources => {
//   const canvas = document.createElement('canvas');

//   const regl = createRegl({
//     canvas,
//     // needed for float textures
//     extensions: 'OES_texture_float'
//   });

//   const textureBuffer = new Float32Array(dataShape[0] * dataShape[1] * 4);
//   const texture = regl.texture({
//     data: textureBuffer,
//     shape: [...dataShape, 4],
//     type: 'float'
//   });

//   const framebuffer = regl.framebuffer({
//     color: texture,
//     depth: false,
//     stencil: false
//   });

//   const [uColorMapTex, uColorMapRes] = createColorTexture(regl, colorMap);

//   let dataTexture;

//   const renderTexture = regl({
//     framebuffer: () => framebuffer,

//     vert: VS,
//     frag: FS,

//     attributes: {
//       // a triangle big enough to fill the screen
//       aPosition: [-4, 0, 4, 4, 4, -4]
//     },

//     uniforms: {
//       uColorMapTex,
//       uColorMapRes,
//       uMinValue: minValue,
//       uMaxValue: maxValue,
//       // Must use a function to pick up the most current `dataTexture`
//       uDataTex: () => dataTexture
//     },

//     count: 3
//   });

//   const textures = sources.map(
//     ({ data, shape, dtype }) =>
//       new Promise((resolve, reject) => {
//         if (shape[0] !== dataShape[0] || shape[1] !== dataShape[1]) {
//           reject(
//             new Error('The renderer currently only matrices of equal shape.')
//           );
//         }

//         dataTexture = regl.texture({
//           data,
//           shape: [...shape, 1],
//           type: dtype
//         });

//         regl.clear({
//           // background color (transparent)
//           color: [0, 0, 0, 0],
//           depth: 1
//         });

//         renderTexture(() => {
//           regl.draw();
//           resolve(PIXI.Texture.fromBuffer(regl.read(), ...shape));
//         });
//       })
//   );

//   framebuffer.destroy();

//   return Promise.all(textures);
// };

const createColorTexture2 = colors => {
  const colorTexRes = Math.max(2, Math.ceil(Math.sqrt(colors.length)));
  const rgba = new Float32Array(colorTexRes ** 2 * 4);
  colors.forEach((color, i) => {
    rgba[i * 4] = color[0]; // r
    rgba[i * 4 + 1] = color[1]; // g
    rgba[i * 4 + 2] = color[2]; // b
    rgba[i * 4 + 3] = color[3]; // a
  });

  return [PIXI.Texture.fromBuffer(rgba, colorTexRes, colorTexRes), colorTexRes];
};

const createMatrixRenderer2 = ({
  colorMap,
  shape: dataShape,
  minValue = 0,
  maxValue = 1
}) => sources => {
  const canvas = document.createElement('canvas');

  const renderer = new PIXI.Renderer({
    width: 16,
    height: 16,
    view: canvas,
    antialias: true,
    transparent: true,
    resolution: window.devicePixelRatio,
    autoDensity: true
  });

  const [uColorMapTex, uColorMapRes] = createColorTexture2(colorMap);

  // eslint-disable-next-line
  const renderTexture = new PIXI.RenderTexture.create(16, 16);

  const textures = sources.map(
    ({ data, shape, dtype }) =>
      new Promise((resolve, reject) => {
        if (shape[0] !== dataShape[0] || shape[1] !== dataShape[1]) {
          reject(
            new Error('The renderer currently only matrices of equal shape.')
          );
        }

        const uDataTex = PIXI.Texture.fromBuffer(
          new Float32Array(data),
          shape[0],
          shape[1],
          {
            format: PIXI.FORMATS.LUMINANCE,
            type: dtype === 'float32' ? PIXI.TYPES.FLOAT : undefined
          }
        );

        const uniforms = new PIXI.UniformGroup({
          uColorMapTex,
          uColorMapRes,
          uDataTex,
          uMinValue: minValue,
          uMaxValue: maxValue
        });

        const shader = PIXI.Shader.from(VS2, FS, uniforms);

        // a triangle big enough to fill the screen
        const positions = new Float32Array([-4, 0, 4, 4, 4, -4]);

        const geometry = new PIXI.Geometry();
        geometry.addAttribute('aPosition', positions, 2); // x,y

        const state = new PIXI.State();
        const mesh = new PIXI.Mesh(geometry, shader, state);

        renderer.render(mesh, renderTexture);

        resolve(renderTexture.clone());
      })
  );

  return Promise.all(textures);
};

export default createMatrixRenderer2;
