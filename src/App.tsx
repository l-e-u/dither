import "./App.css";
import Dither from "./components/Dither";
import { useLoader } from "@react-three/fiber";
import { TextureLoader, VideoTexture } from "three";
import { useEffect, useRef } from "react";

function VideoComponent() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const textureRef = useRef<VideoTexture | null>(null);

  useEffect(() => {
    const video = document.createElement("video");
    video.src =
      "https://cdn.pixabay.com/video/2016/01/31/2029-153703075_large.mp4";
    video.crossOrigin = "anonymous";
    video.loop = true;
    video.muted = true;
    video.playsInline = true;

    video.addEventListener("loadeddata", () => {
      video.play();
    });

    videoRef.current = video;
    textureRef.current = new VideoTexture(video);

    return () => {
      video.pause();
      video.src = "";
    };
  }, []);

  if (!textureRef.current) return null;

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <meshBasicMaterial map={textureRef.current} />
    </mesh>
  );
}

function ImageComponent() {
  const texture = useLoader(
    TextureLoader,
    "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop"
  );

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <meshBasicMaterial map={texture} />
    </mesh>
  );
}

function App() {
  return (
    <div style={{ width: "100%", height: "100vh", position: "relative" }}>
      {/* Example with video */}
      <div style={{ width: "100%", height: "50%", display: "block" }}>
        <Dither colorNum={8} pixelSize={2}>
          <VideoComponent />
        </Dither>
      </div>

      {/* Example with image */}
      <div style={{ width: "100%", height: "50%", display: "block" }}>
        <Dither colorNum={4} pixelSize={3}>
          <ImageComponent />
        </Dither>
      </div>
    </div>
  );
}

export default App;
