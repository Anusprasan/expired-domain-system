import React, { useEffect, useRef, useState } from "react";
import { useReportingUiCopy } from "../hooks/useReportingUiCopy";

function clampZoom(value) {
  const numericValue = Number(value || 1);

  if (Number.isNaN(numericValue)) {
    return 1;
  }

  return Math.min(4, Math.max(1, numericValue));
}

export default function ReportingEvidenceGalleryModal({
  isOpen,
  title,
  images,
  activeIndex,
  onClose,
  onSelect,
}) {
  const { copy } = useReportingUiCopy();
  const shellRef = useRef(null);
  const stageRef = useRef(null);
  const imageRef = useRef(null);
  const dragStateRef = useRef({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    panX: 0,
    panY: 0,
  });
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [baseImageSize, setBaseImageSize] = useState({ width: 0, height: 0 });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const safeImages = Array.isArray(images) ? images : [];
  const hasImages = safeImages.length > 0;
  const safeIndex = hasImages
    ? Math.max(0, Math.min(Number(activeIndex) || 0, safeImages.length - 1))
    : 0;
  const activeImage = hasImages ? safeImages[safeIndex] || null : null;
  const canRender = isOpen && hasImages;

  const getZoomMetrics = (nextZoom = zoom) => {
    const safeZoom = clampZoom(nextZoom);
    const viewportWidth = Number(viewportSize.width || 0);
    const viewportHeight = Number(viewportSize.height || 0);
    const width = Number(baseImageSize.width || 0);
    const height = Number(baseImageSize.height || 0);
    const scaledWidth = Math.max(1, Math.round(width * safeZoom));
    const scaledHeight = Math.max(1, Math.round(height * safeZoom));
    const centerLeft = (viewportWidth - scaledWidth) / 2;
    const centerTop = (viewportHeight - scaledHeight) / 2;
    const overflowX = Math.max(0, (scaledWidth - viewportWidth) / 2);
    const overflowY = Math.max(0, (scaledHeight - viewportHeight) / 2);

    return {
      zoom: safeZoom,
      viewportWidth,
      viewportHeight,
      width,
      height,
      scaledWidth,
      scaledHeight,
      centerLeft,
      centerTop,
      minX: -overflowX,
      maxX: overflowX,
      minY: -overflowY,
      maxY: overflowY,
    };
  };

  const clampPan = (nextPan, nextZoom = zoom) => {
    const metrics = getZoomMetrics(nextZoom);

    if (!metrics.width || !metrics.height || nextZoom <= 1) {
      return { x: 0, y: 0 };
    }

    return {
      x: Math.min(metrics.maxX, Math.max(metrics.minX, Number(nextPan?.x || 0))),
      y: Math.min(metrics.maxY, Math.max(metrics.minY, Number(nextPan?.y || 0))),
    };
  };

  const getFullscreenElement = () => {
    if (typeof document === "undefined") {
      return null;
    }

    return (
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement ||
      null
    );
  };

  const updateFullscreenState = () => {
    setIsFullscreen(getFullscreenElement() === shellRef.current);
  };

  const requestShellFullscreen = async () => {
    const shell = shellRef.current;

    if (!shell) {
      return;
    }

    if (shell.requestFullscreen) {
      await shell.requestFullscreen();
      return;
    }

    if (shell.webkitRequestFullscreen) {
      await shell.webkitRequestFullscreen();
      return;
    }

    if (shell.mozRequestFullScreen) {
      await shell.mozRequestFullScreen();
      return;
    }

    if (shell.msRequestFullscreen) {
      await shell.msRequestFullscreen();
    }
  };

  const exitAnyFullscreen = async () => {
    if (typeof document === "undefined") {
      return;
    }

    if (document.exitFullscreen) {
      await document.exitFullscreen();
      return;
    }

    if (document.webkitExitFullscreen) {
      await document.webkitExitFullscreen();
      return;
    }

    if (document.mozCancelFullScreen) {
      await document.mozCancelFullScreen();
      return;
    }

    if (document.msExitFullscreen) {
      await document.msExitFullscreen();
    }
  };

  const handleZoomChange = (nextZoom, anchor = null) => {
    const clampedZoom = clampZoom(nextZoom);
    const currentZoom = clampZoom(zoom);
    const stage = stageRef.current;

    if (!stage || clampedZoom === currentZoom) {
      setZoom(clampedZoom);
      if (clampedZoom <= 1) {
        setPan({ x: 0, y: 0 });
      }
      return;
    }

    const currentMetrics = getZoomMetrics(currentZoom);

    if (!currentMetrics.width || !currentMetrics.height) {
      setZoom(clampedZoom);
      setPan(clampedZoom <= 1 ? { x: 0, y: 0 } : clampPan(pan, clampedZoom));
      return;
    }

    const stageRect = stage.getBoundingClientRect();
    const anchorOffsetX =
      anchor?.clientX != null
        ? Math.max(0, Math.min(stageRect.width, anchor.clientX - stageRect.left))
        : currentMetrics.viewportWidth / 2;
    const anchorOffsetY =
      anchor?.clientY != null
        ? Math.max(0, Math.min(stageRect.height, anchor.clientY - stageRect.top))
        : currentMetrics.viewportHeight / 2;
    const currentLeft = currentMetrics.centerLeft + pan.x;
    const currentTop = currentMetrics.centerTop + pan.y;
    const relativeX = currentMetrics.scaledWidth
      ? (anchorOffsetX - currentLeft) / currentMetrics.scaledWidth
      : 0.5;
    const relativeY = currentMetrics.scaledHeight
      ? (anchorOffsetY - currentTop) / currentMetrics.scaledHeight
      : 0.5;
    const nextMetrics = getZoomMetrics(clampedZoom);
    const nextPan = clampedZoom <= 1
      ? { x: 0, y: 0 }
      : clampPan(
          {
            x:
              anchorOffsetX -
              nextMetrics.centerLeft -
              Math.max(0, Math.min(1, relativeX)) * nextMetrics.scaledWidth,
            y:
              anchorOffsetY -
              nextMetrics.centerTop -
              Math.max(0, Math.min(1, relativeY)) * nextMetrics.scaledHeight,
          },
          clampedZoom
        );

    setZoom(clampedZoom);
    setPan(nextPan);
  };

  const handleToggleFullscreen = async () => {
    try {
      if (getFullscreenElement() === shellRef.current) {
        await exitAnyFullscreen();
        updateFullscreenState();
        return;
      }

      await requestShellFullscreen();
      updateFullscreenState();
    } catch {
      // Ignore fullscreen failures and leave the modal usable.
      updateFullscreenState();
    }
  };

  const handleClose = () => {
    if (getFullscreenElement() === shellRef.current) {
      void exitAnyFullscreen().catch(() => {});
    }

    setIsFullscreen(false);
    onClose();
  };

  const updateBaseImageSize = () => {
    const stage = stageRef.current;
    const image = imageRef.current;

    if (!stage || !image || !activeImage?.source) {
      setBaseImageSize({ width: 0, height: 0 });
      setViewportSize({ width: 0, height: 0 });
      return;
    }

    const naturalWidth = Number(image.naturalWidth || 0);
    const naturalHeight = Number(image.naturalHeight || 0);

    if (!naturalWidth || !naturalHeight) {
      return;
    }

    const availableWidth = Math.max(stage.clientWidth, 1);
    const availableHeight = Math.max(stage.clientHeight, 1);
    const fitScale = Math.min(availableWidth / naturalWidth, availableHeight / naturalHeight, 1);
    const width = Math.max(1, Math.round(naturalWidth * fitScale));
    const height = Math.max(1, Math.round(naturalHeight * fitScale));

    setViewportSize((currentSize) =>
      currentSize.width === availableWidth && currentSize.height === availableHeight
        ? currentSize
        : { width: availableWidth, height: availableHeight }
    );
    setBaseImageSize((currentSize) =>
      currentSize.width === width && currentSize.height === height
        ? currentSize
        : { width, height }
    );
  };

  const handleStageWheel = (event) => {
    if (!activeImage?.source) {
      return;
    }

    event.preventDefault();
    handleZoomChange(zoom + (event.deltaY < 0 ? 0.05 : -0.05), {
      clientX: event.clientX,
      clientY: event.clientY,
    });
  };

  const stopDragging = () => {
    dragStateRef.current.active = false;
    dragStateRef.current.pointerId = null;
    setIsDragging(false);
  };

  const handleStagePointerDown = (event) => {
    if (zoom <= 1 || event.button !== 0 || !stageRef.current) {
      return;
    }

    if (event.target instanceof Element && event.target.closest(".reporting-gallery-nav")) {
      return;
    }

    dragStateRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };

    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handleStagePointerMove = (event) => {
    if (!dragStateRef.current.active || dragStateRef.current.pointerId !== event.pointerId || !stageRef.current) {
      return;
    }

    const deltaX = event.clientX - dragStateRef.current.startX;
    const deltaY = event.clientY - dragStateRef.current.startY;

    setPan(
      clampPan(
        {
          x: dragStateRef.current.panX + deltaX,
          y: dragStateRef.current.panY + deltaY,
        },
        zoom
      )
    );
  };

  const handleStagePointerUp = (event) => {
    if (dragStateRef.current.pointerId === event.pointerId) {
      stopDragging();
    }
  };

  useEffect(() => {
    if (!canRender) {
      setIsFullscreen(false);
      stopDragging();
      setBaseImageSize({ width: 0, height: 0 });
      setViewportSize({ width: 0, height: 0 });
      setPan({ x: 0, y: 0 });
      return undefined;
    }

    setZoom(1);
    setPan({ x: 0, y: 0 });
    updateFullscreenState();
    requestAnimationFrame(() => {
      updateBaseImageSize();
    });
    return undefined;
  }, [canRender, safeIndex]);

  useEffect(() => {
    setPan((currentPan) => {
      const nextPan = clampPan(currentPan, zoom);

      if (nextPan.x === currentPan.x && nextPan.y === currentPan.y) {
        return currentPan;
      }

      return nextPan;
    });
  }, [zoom, baseImageSize.width, baseImageSize.height, viewportSize.width, viewportSize.height]);

  useEffect(() => {
    if (!canRender) {
      return undefined;
    }

    const handleResize = () => updateBaseImageSize();

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [canRender, activeImage?.source]);

  useEffect(() => {
    const handleFullscreenChange = () => updateFullscreenState();

    if (typeof document !== "undefined") {
      document.addEventListener("fullscreenchange", handleFullscreenChange);
      document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.addEventListener("mozfullscreenchange", handleFullscreenChange);
      document.addEventListener("MSFullscreenChange", handleFullscreenChange);
      handleFullscreenChange();
    }

    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("fullscreenchange", handleFullscreenChange);
        document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
        document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
        document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
      }
    };
  }, []);

  useEffect(() => {
    if (!canRender) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        handleClose();
        return;
      }

      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        handleZoomChange(zoom + 0.01);
      }

      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        handleZoomChange(zoom - 0.01);
      }

      if (event.key === "0") {
        event.preventDefault();
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }

      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        void handleToggleFullscreen();
      }

      if (safeImages.length <= 1) {
        return;
      }

      if (event.key === "ArrowLeft") {
        onSelect((safeIndex - 1 + safeImages.length) % safeImages.length);
      }

      if (event.key === "ArrowRight") {
        onSelect((safeIndex + 1) % safeImages.length);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canRender, onSelect, safeImages.length, safeIndex, zoom]);

  if (!canRender) {
    return null;
  }

  const zoomMetrics = getZoomMetrics(zoom);
  const hasMeasuredImage =
    Boolean(activeImage?.source) &&
    Boolean(zoomMetrics.width) &&
    Boolean(zoomMetrics.height) &&
    Boolean(zoomMetrics.viewportWidth) &&
    Boolean(zoomMetrics.viewportHeight);
  const imageStyle = hasMeasuredImage
    ? {
        width: `${zoomMetrics.scaledWidth}px`,
        height: `${zoomMetrics.scaledHeight}px`,
        left: `${Math.round(zoomMetrics.centerLeft + pan.x)}px`,
        top: `${Math.round(zoomMetrics.centerTop + pan.y)}px`,
      }
    : {
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        maxWidth: "100%",
        maxHeight: "100%",
      };

  return (
    <div className="workflow-modal-backdrop reporting-gallery-backdrop" role="presentation" onClick={handleClose}>
      <div
        ref={shellRef}
        className="workflow-modal-shell reporting-gallery-modal-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reporting-gallery-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="reporter-task-modal-body">
          <div className="reporting-gallery-modal-body">
            <div className="reporting-gallery-toolbar">
              <div className="reporting-gallery-toolbar-group">
                <button
                  type="button"
                  className="management-button-secondary workflow-modal-close"
                  onClick={handleClose}
                >
                  {copy.gallery.close}
                </button>
                <button
                  type="button"
                  className="management-button-secondary reporting-gallery-toolbar-button"
                  onClick={() => handleZoomChange(zoom - 0.01)}
                  disabled={zoom <= 1}
                >
                  {copy.gallery.zoomOut}
                </button>
                <span className="reporting-gallery-zoom-value">{Math.round(zoom * 100)}%</span>
                <button
                  type="button"
                  className="management-button-secondary reporting-gallery-toolbar-button"
                  onClick={() => handleZoomChange(zoom + 0.01)}
                  disabled={zoom >= 4}
                >
                  {copy.gallery.zoomIn}
                </button>
                <button
                  type="button"
                  className="management-button-secondary reporting-gallery-toolbar-button"
                  onClick={() => setZoom(1)}
                  disabled={zoom === 1}
                >
                  {copy.gallery.reset}
                </button>
              </div>

              <div className="reporting-gallery-toolbar-group">
                <button
                  type="button"
                  className="management-button-secondary reporting-gallery-toolbar-button"
                  onClick={() => void handleToggleFullscreen()}
                >
                  {isFullscreen ? copy.gallery.exitFullScreen : copy.gallery.fullScreen}
                </button>
              </div>
            </div>

            <div className="reporting-gallery-stage">
              {safeImages.length > 1 ? (
                <>
                  <button
                    type="button"
                    className="reporting-gallery-nav is-prev"
                    onClick={() => onSelect((safeIndex - 1 + safeImages.length) % safeImages.length)}
                    aria-label={copy.gallery.previousImage}
                  >
                    {copy.gallery.prev}
                  </button>

                  <button
                    type="button"
                    className="reporting-gallery-nav is-next"
                    onClick={() => onSelect((safeIndex + 1) % safeImages.length)}
                    aria-label={copy.gallery.nextImage}
                  >
                    {copy.gallery.next}
                  </button>
                </>
              ) : null}

              <div
                ref={stageRef}
                className={`reporting-gallery-stage-image${zoom > 1 ? " is-zoomed" : ""}${
                  isDragging ? " is-dragging" : ""
                }`}
                onWheel={handleStageWheel}
                onPointerDown={handleStagePointerDown}
                onPointerMove={handleStagePointerMove}
                onPointerUp={handleStagePointerUp}
                onPointerCancel={handleStagePointerUp}
              >
                <div className="reporting-gallery-image-layer">
                  {activeImage?.source ? (
                    <img
                      ref={imageRef}
                      className="reporting-gallery-stage-media"
                      draggable={false}
                      src={activeImage.source}
                      alt={activeImage.name}
                      onLoad={updateBaseImageSize}
                      style={imageStyle}
                      onDoubleClick={(event) =>
                        handleZoomChange(zoom === 1 ? 2 : 1, {
                          clientX: event.clientX,
                          clientY: event.clientY,
                        })
                      }
                    />
                  ) : (
                    <span>{copy.gallery.previewUnavailable}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="reporting-gallery-caption">
              <strong>{activeImage?.name || copy.gallery.imageFallback}</strong>
              <span>
                {copy.gallery.of(safeIndex + 1, safeImages.length)}
              </span>
            </div>

            <div className="reporting-gallery-thumbs">
              {safeImages.map((image, index) => (
                <button
                  key={`${image.id}-${index}`}
                  type="button"
                  className={`reporting-gallery-thumb${index === safeIndex ? " is-active" : ""}`}
                  onClick={() => onSelect(index)}
                >
                  <div className="reporting-gallery-thumb-frame">
                    {image?.source ? (
                      <img src={image.source} alt={image.name} />
                    ) : (
                      <span>{copy.common.noPreview}</span>
                    )}
                  </div>
                  <span>{image.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
