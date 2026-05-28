import { useEffect, useMemo, useRef, useState } from "react";
import { getReportingSubmissionImageBlobApi } from "../api/reportingApi";

function getImageKey(submissionId, imageId) {
  return `${submissionId || ""}:${imageId || ""}`;
}

function revokeObjectUrlMap(urlMap) {
  Object.values(urlMap || {}).forEach((url) => {
    if (typeof url === "string" && url.startsWith("blob:")) {
      URL.revokeObjectURL(url);
    }
  });
}

export function useReportingEvidenceImages(reportId, submissions) {
  const [imageUrls, setImageUrls] = useState({});
  const [loadingKeys, setLoadingKeys] = useState({});
  const imageUrlsRef = useRef({});

  const imageEntries = useMemo(
    () =>
      (submissions || []).flatMap((submission) =>
        (submission?.images || []).map((image) => ({
          key: getImageKey(submission?._id, image?.id),
          submissionId: submission?._id || "",
          imageId: image?.id || "",
        }))
      ),
    [submissions]
  );

  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();

    if (!reportId || !imageEntries.length) {
      setLoadingKeys({});
      revokeObjectUrlMap(imageUrlsRef.current);
      imageUrlsRef.current = {};
      setImageUrls({});
      return () => {
        controller.abort();
      };
    }

    setLoadingKeys(
      imageEntries.reduce((accumulator, entry) => {
        accumulator[entry.key] = true;
        return accumulator;
      }, {})
    );

    (async () => {
      const nextUrls = {};

      await Promise.all(
        imageEntries.map(async (entry) => {
          try {
            const blob = await getReportingSubmissionImageBlobApi(
              reportId,
              entry.submissionId,
              entry.imageId,
              { signal: controller.signal }
            );

            if (!isActive) {
              return;
            }

            nextUrls[entry.key] = URL.createObjectURL(blob);
          } catch (error) {
            if (controller.signal.aborted || !isActive) {
              return;
            }
          }
        })
      );

      if (!isActive) {
        revokeObjectUrlMap(nextUrls);
        return;
      }

      revokeObjectUrlMap(imageUrlsRef.current);
      imageUrlsRef.current = nextUrls;
      setImageUrls(nextUrls);
      setLoadingKeys({});
    })();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [imageEntries, reportId]);

  useEffect(
    () => () => {
      revokeObjectUrlMap(imageUrlsRef.current);
      imageUrlsRef.current = {};
    },
    []
  );

  const getImageSource = (image, submissionId = "") => {
    if (image?.previewUrl) {
      return image.previewUrl;
    }

    const imageSubmissionId = image?.submissionId || submissionId;
    return imageUrls[getImageKey(imageSubmissionId, image?.id)] || "";
  };

  const isImageLoading = (image, submissionId = "") => {
    if (image?.previewUrl) {
      return false;
    }

    const imageSubmissionId = image?.submissionId || submissionId;
    return Boolean(loadingKeys[getImageKey(imageSubmissionId, image?.id)]);
  };

  return {
    getImageSource,
    isImageLoading,
  };
}
