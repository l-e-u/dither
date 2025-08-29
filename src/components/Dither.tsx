/* eslint-disable react/no-unknown-property */
import { useRef, useEffect, forwardRef, type ReactNode } from "react";
import { Canvas, useFrame, useThree, createPortal } from "@react-three/fiber";
import { EffectComposer, wrapEffect } from "@react-three/postprocessing";
import { Effect } from "postprocessing";
import * as THREE from "three";

const vertexShader = `
precision highp float;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 modelPosition = modelMatrix * vec4(position, 1.0);
  vec4 viewPosition = viewMatrix * modelPosition;
  gl_Position = projectionMatrix * viewPosition;
}
`;

const textureFragmentShader = `
precision highp float;
uniform sampler2D inputTexture;
varying vec2 vUv;

void main() {
  vec4 texColor = texture2D(inputTexture, vUv);
  gl_FragColor = texColor;
}
`;

const ditherFragmentShader = `
precision highp float;
uniform float colorNum;
uniform float pixelSize;
const float bayerMatrix8x8[64] = float[64](
  0.0/64.0, 48.0/64.0, 12.0/64.0, 60.0/64.0,  3.0/64.0, 51.0/64.0, 15.0/64.0, 63.0/64.0,
  32.0/64.0,16.0/64.0, 44.0/64.0, 28.0/64.0, 35.0/64.0,19.0/64.0, 47.0/64.0, 31.0/64.0,
  8.0/64.0, 56.0/64.0,  4.0/64.0, 52.0/64.0, 11.0/64.0,59.0/64.0,  7.0/64.0, 55.0/64.0,
  40.0/64.0,24.0/64.0, 36.0/64.0, 20.0/64.0, 43.0/64.0,27.0/64.0, 39.0/64.0, 23.0/64.0,
  2.0/64.0, 50.0/64.0, 14.0/64.0, 62.0/64.0,  1.0/64.0,49.0/64.0, 13.0/64.0, 61.0/64.0,
  34.0/64.0,18.0/64.0, 46.0/64.0, 30.0/64.0, 33.0/64.0,17.0/64.0, 45.0/64.0, 29.0/64.0,
  10.0/64.0,58.0/64.0,  6.0/64.0, 54.0/64.0,  9.0/64.0,57.0/64.0,  5.0/64.0, 53.0/64.0,
  42.0/64.0,26.0/64.0, 38.0/64.0, 22.0/64.0, 41.0/64.0,25.0/64.0, 37.0/64.0, 21.0/64.0
);

vec3 dither(vec2 uv, vec3 color) {
  vec2 scaledCoord = floor(uv * resolution / pixelSize);
  int x = int(mod(scaledCoord.x, 8.0));
  int y = int(mod(scaledCoord.y, 8.0));
  float threshold = bayerMatrix8x8[y * 8 + x] - 0.25;
  float step = 1.0 / (colorNum - 1.0);
  color += threshold * step;
  float bias = 0.2;
  color = clamp(color - bias, 0.0, 1.0);
  return floor(color * (colorNum - 1.0) + 0.5) / (colorNum - 1.0);
}

void mainImage(in vec4 inputColor, in vec2 uv, out vec4 outputColor) {
  vec2 normalizedPixelSize = pixelSize / resolution;
  vec2 uvPixel = normalizedPixelSize * floor(uv / normalizedPixelSize);
  vec4 color = texture2D(inputBuffer, uvPixel);
  color.rgb = dither(uv, color.rgb);
  outputColor = color;
}
`;

class DitherEffectImpl extends Effect {
  public uniforms: Map<string, THREE.Uniform<any>>;
  constructor() {
    const uniforms = new Map<string, THREE.Uniform<any>>([
      ["colorNum", new THREE.Uniform(4.0)],
      ["pixelSize", new THREE.Uniform(2.0)],
    ]);
    super("DitherEffect", ditherFragmentShader, { uniforms });
    this.uniforms = uniforms;
  }
  set colorNum(value: number) {
    this.uniforms.get("colorNum")!.value = value;
  }
  get colorNum(): number {
    return this.uniforms.get("colorNum")!.value;
  }
  set pixelSize(value: number) {
    this.uniforms.get("pixelSize")!.value = value;
  }
  get pixelSize(): number {
    return this.uniforms.get("pixelSize")!.value;
  }
}

const DitherEffect = forwardRef<
  DitherEffectImpl,
  { colorNum: number; pixelSize: number }
>((props, ref) => {
  const { colorNum, pixelSize } = props;
  const WrappedDitherEffect = wrapEffect(DitherEffectImpl);
  return (
    <WrappedDitherEffect ref={ref} colorNum={colorNum} pixelSize={pixelSize} />
  );
});

DitherEffect.displayName = "DitherEffect";

interface TextureUniforms {
  [key: string]: THREE.Uniform<any>;
  inputTexture: THREE.Uniform<THREE.Texture | null>;
}

interface DitheredContentProps {
  colorNum: number;
  pixelSize: number;
  children: ReactNode;
}

function DitheredContent({
  colorNum,
  pixelSize,
  children,
}: DitheredContentProps) {
  const mesh = useRef<THREE.Mesh>(null);
  const renderTarget = useRef<THREE.WebGLRenderTarget | null>(null);
  const childrenScene = useRef<THREE.Scene | null>(null);
  const childrenCamera = useRef<THREE.OrthographicCamera | null>(null);
  const { viewport, size, gl } = useThree();

  const textureUniformsRef = useRef<TextureUniforms>({
    inputTexture: new THREE.Uniform(null),
  });

  // Initialize render target and scene for children
  useEffect(() => {
    const dpr = gl.getPixelRatio();
    const width = Math.floor(size.width * dpr);
    const height = Math.floor(size.height * dpr);

    if (!renderTarget.current) {
      renderTarget.current = new THREE.WebGLRenderTarget(width, height, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
      });
    }

    if (!childrenScene.current) {
      childrenScene.current = new THREE.Scene();
    }

    if (!childrenCamera.current) {
      const aspect = width / height;
      const camera = new THREE.OrthographicCamera(
        -aspect,
        aspect,
        1,
        -1,
        0.1,
        1000
      );
      camera.position.z = 1;
      childrenCamera.current = camera;
    }

    textureUniformsRef.current.inputTexture.value =
      renderTarget.current.texture;

    return () => {
      if (renderTarget.current) {
        renderTarget.current.dispose();
      }
    };
  }, [size, gl]);

  useEffect(() => {
    const dpr = gl.getPixelRatio();
    const newWidth = Math.floor(size.width * dpr);
    const newHeight = Math.floor(size.height * dpr);

    // Update render target size
    if (renderTarget.current) {
      renderTarget.current.setSize(newWidth, newHeight);
    }
  }, [size, gl]);

  useFrame(() => {
    // Render children to texture
    if (
      renderTarget.current &&
      childrenScene.current &&
      childrenCamera.current
    ) {
      const currentRenderTarget = gl.getRenderTarget();
      gl.setRenderTarget(renderTarget.current);
      gl.render(childrenScene.current, childrenCamera.current);
      gl.setRenderTarget(currentRenderTarget);
    }
  });

  return (
    <>
      <mesh ref={mesh} scale={[viewport.width, viewport.height, 1]}>
        <planeGeometry args={[1, 1]} />
        <shaderMaterial
          vertexShader={vertexShader}
          fragmentShader={textureFragmentShader}
          uniforms={textureUniformsRef.current}
        />
      </mesh>

      <EffectComposer>
        <DitherEffect colorNum={colorNum} pixelSize={pixelSize} />
      </EffectComposer>

      {childrenScene.current && createPortal(children, childrenScene.current)}
    </>
  );
}

interface DitherProps {
  colorNum?: number;
  pixelSize?: number;
  children: ReactNode;
}

export default function Dither({
  colorNum = 4,
  pixelSize = 2,
  children,
}: DitherProps) {
  return (
    <Canvas
      className="dither-container"
      camera={{ position: [0, 0, 6] }}
      dpr={window.devicePixelRatio}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      style={{ width: "100%", height: "100%", position: "relative" }}
    >
      <DitheredContent
        colorNum={colorNum}
        pixelSize={pixelSize}
        children={children}
      />
    </Canvas>
  );
}
