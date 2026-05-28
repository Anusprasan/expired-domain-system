import {
  cleanupReportingEvidenceStorageService,
  claimReportingReportService,
  createReportingReportService,
  createReportingMailProfileService,
  createReportingMyMailProfileService,
  createReportingSubmissionService,
  deleteReportingSubmissionOldImagesService,
  deleteReportingSubmissionService,
  deleteReportingTaskService,
  deleteReportingMailProfileService,
  deleteReportingMyMailProfileService,
  generateReportingEmailService,
  getReportingEvidenceStorageSummaryService,
  getReportingMailProfilesAdminService,
  getReportingMailProfilesMineService,
  getReportingOverviewService,
  getReportingReportDetailService,
  getReportingReportsService,
  getReportingSubmissionImageService,
  getReportingTaskTrackingService,
  getReportingUserSettingsService,
  getReportingWorkflowsService,
  markReportingClaimCheckedService,
  rejectReportingClaimService,
  reverseReportingClaimCheckedService,
  saveReportingEmailDraftService,
  sendReportingMailProfileTestService,
  sendReportingMyMailProfileTestService,
  sendReportingEmailService,
  unclaimReportingReportService,
  updateReportingMailProfileService,
  updateReportingMyMailProfileService,
  updateReportingTaskService,
  updateReportingSubmissionService,
  updateReportingUserSettingsService,
  updateReportingWorkflowService,
  updateReportingReportStatusService,
} from "./reporting.service.js";

export async function getReportingWorkflows(req, res) {
  try {
    const workflows = await getReportingWorkflowsService();

    return res.json({
      success: true,
      data: workflows,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function getReportingOverview(req, res) {
  const overview = await getReportingOverviewService(req.user);

  return res.json({
    success: true,
    data: overview,
  });
}

export async function getReportingUserSettings(req, res) {
  try {
    const settings = await getReportingUserSettingsService(req.user);

    return res.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function updateReportingUserSettings(req, res) {
  try {
    const settings = await updateReportingUserSettingsService(req.body, req.user);

    req.auditLog = {
      ...req.auditLog,
      module: "reporting",
      category: "settings",
      action: "reporting.settings.update",
      targetType: "user",
      targetId: req.user._id.toString(),
      targetLabel: req.user.email,
      summary: "Updated reporting AI and SMTP settings",
      details: "Saved personal reporting settings",
    };

    return res.json({
      success: true,
      message: "Reporting settings saved successfully",
      data: settings,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function getReportingEvidenceStorageSummary(req, res) {
  try {
    const summary = await getReportingEvidenceStorageSummaryService(req.query, req.user);

    return res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function cleanupReportingEvidenceStorage(req, res) {
  try {
    const result = await cleanupReportingEvidenceStorageService(req.body, req.user);

    req.auditLog = {
      ...req.auditLog,
      module: "reporting",
      action: "reporting.evidence.cleanup_global",
      targetType: "reporting-evidence",
      targetId: "global",
      summary: "Exported and deleted reporting evidence images by date",
      details: `Exported and deleted reporting evidence images on or before ${result.cleanupCutoff}`,
      metadata: {
        deletedImageCount: result.deletedCount,
        deletedImageBytes: result.deletedBytes,
        affectedSubmissionCount: result.affectedSubmissionCount,
        cleanupCutoff: result.cleanupCutoff,
      },
    };

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Length", String(result.content?.length || 0));
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("X-Reporting-Deleted-Image-Count", String(result.deletedCount || 0));
    res.setHeader("X-Reporting-Deleted-Image-Bytes", String(result.deletedBytes || 0));
    res.setHeader(
      "X-Reporting-Affected-Submission-Count",
      String(result.affectedSubmissionCount || 0)
    );
    const encodedFileName = encodeURIComponent(
      result.fileName || "reporting-evidence-cleanup-global.zip"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`
    );

    return res.send(result.content);
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function getReportingMailProfilesAdmin(req, res) {
  try {
    const data = await getReportingMailProfilesAdminService(req.user);

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function getReportingMailProfilesMine(req, res) {
  try {
    const data = await getReportingMailProfilesMineService(req.user);

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function createReportingMailProfile(req, res) {
  try {
    const profile = await createReportingMailProfileService(req.body, req.user);

    req.auditLog = {
      ...req.auditLog,
      module: "reporting",
      category: "smtp-profiles",
      action: "reporting.smtp-profile.create",
      targetType: "reporting-smtp-profile",
      targetId: profile._id.toString(),
      targetLabel: profile.name,
      summary: "Created a reporting SMTP profile",
      details: `Created reporting SMTP profile ${profile.name}`,
    };

    return res.status(201).json({
      success: true,
      message: "Reporting SMTP profile created successfully",
      data: profile,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function createReportingMyMailProfile(req, res) {
  try {
    const profile = await createReportingMyMailProfileService(req.body, req.user);

    req.auditLog = {
      ...req.auditLog,
      module: "reporting",
      category: "smtp-profiles",
      action: "reporting.smtp-profile.personal.create",
      targetType: "reporting-smtp-profile",
      targetId: profile._id.toString(),
      targetLabel: profile.name,
      summary: "Created a personal reporting SMTP profile",
      details: `Created personal reporting SMTP profile ${profile.name}`,
    };

    return res.status(201).json({
      success: true,
      message: "Personal reporting SMTP profile created successfully",
      data: profile,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function updateReportingMailProfile(req, res) {
  try {
    const profile = await updateReportingMailProfileService(req.params.profileId, req.body, req.user);

    req.auditLog = {
      ...req.auditLog,
      module: "reporting",
      category: "smtp-profiles",
      action: "reporting.smtp-profile.update",
      targetType: "reporting-smtp-profile",
      targetId: profile._id.toString(),
      targetLabel: profile.name,
      summary: "Updated a reporting SMTP profile",
      details: `Updated reporting SMTP profile ${profile.name}`,
    };

    return res.json({
      success: true,
      message: "Reporting SMTP profile updated successfully",
      data: profile,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function updateReportingMyMailProfile(req, res) {
  try {
    const profile = await updateReportingMyMailProfileService(req.params.profileId, req.body, req.user);

    req.auditLog = {
      ...req.auditLog,
      module: "reporting",
      category: "smtp-profiles",
      action: "reporting.smtp-profile.personal.update",
      targetType: "reporting-smtp-profile",
      targetId: profile._id.toString(),
      targetLabel: profile.name,
      summary: "Updated a personal reporting SMTP profile",
      details: `Updated personal reporting SMTP profile ${profile.name}`,
    };

    return res.json({
      success: true,
      message: "Personal reporting SMTP profile updated successfully",
      data: profile,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function deleteReportingMailProfile(req, res) {
  try {
    const profile = await deleteReportingMailProfileService(req.params.profileId, req.user);

    req.auditLog = {
      ...req.auditLog,
      module: "reporting",
      category: "smtp-profiles",
      action: "reporting.smtp-profile.delete",
      targetType: "reporting-smtp-profile",
      targetId: profile._id.toString(),
      targetLabel: profile.name,
      summary: "Deleted a reporting SMTP profile",
      details: `Deleted reporting SMTP profile ${profile.name}`,
    };

    return res.json({
      success: true,
      message: "Reporting SMTP profile deleted successfully",
      data: { _id: profile._id.toString() },
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function deleteReportingMyMailProfile(req, res) {
  try {
    const profile = await deleteReportingMyMailProfileService(req.params.profileId, req.user);

    req.auditLog = {
      ...req.auditLog,
      module: "reporting",
      category: "smtp-profiles",
      action: "reporting.smtp-profile.personal.delete",
      targetType: "reporting-smtp-profile",
      targetId: profile._id.toString(),
      targetLabel: profile.name,
      summary: "Deleted a personal reporting SMTP profile",
      details: `Deleted personal reporting SMTP profile ${profile.name}`,
    };

    return res.json({
      success: true,
      message: "Personal reporting SMTP profile deleted successfully",
      data: { _id: profile._id.toString() },
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function sendReportingMailProfileTest(req, res) {
  try {
    const testResult = await sendReportingMailProfileTestService(req.params.profileId, req.body, req.user);

    req.auditLog = {
      ...req.auditLog,
      module: "reporting",
      category: "smtp-profiles",
      action: "reporting.smtp-profile.test",
      targetType: "reporting-smtp-profile",
      targetId: testResult.profileId,
      targetLabel: testResult.name,
      summary: "Sent a reporting SMTP profile test email",
      details: `Sent SMTP profile test email for ${testResult.name}`,
      metadata: {
        to: testResult.to,
      },
    };

    return res.json({
      success: true,
      message: "SMTP profile test email sent successfully",
      data: testResult,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function sendReportingMyMailProfileTest(req, res) {
  try {
    const testResult = await sendReportingMyMailProfileTestService(req.params.profileId, req.body, req.user);

    req.auditLog = {
      ...req.auditLog,
      module: "reporting",
      category: "smtp-profiles",
      action: "reporting.smtp-profile.personal.test",
      targetType: "reporting-smtp-profile",
      targetId: testResult.profileId,
      targetLabel: testResult.name,
      summary: "Sent a personal reporting SMTP profile test email",
      details: `Sent personal SMTP profile test email for ${testResult.name}`,
      metadata: {
        to: testResult.to,
      },
    };

    return res.json({
      success: true,
      message: "Personal SMTP profile test email sent successfully",
      data: testResult,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function getReportingReports(req, res) {
  try {
    const reports = await getReportingReportsService(req.query, req.user);

    return res.json({
      success: true,
      data: reports,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function getReportingReportDetail(req, res) {
  try {
    const detail = await getReportingReportDetailService(req.params.id, req.user);

    return res.json({
      success: true,
      data: detail,
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      message: error.message,
    });
  }
}

export async function getReportingSubmissionImage(req, res) {
  try {
    const image = await getReportingSubmissionImageService(
      req.params.id,
      req.params.submissionId,
      req.params.imageId,
      req.user
    );

    res.setHeader("Content-Type", image.contentType || "image/png");
    res.setHeader("Content-Length", String(image.size || image.content.length || 0));
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(image.name || "evidence-image")}"`
    );

    return res.send(image.content);
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function deleteReportingSubmissionOldImages(req, res) {
  try {
    const result = await deleteReportingSubmissionOldImagesService(
      req.params.id,
      req.params.submissionId,
      req.body,
      req.user
    );

    req.auditLog = {
      ...req.auditLog,
      module: "reporting",
      action: "reporting.submission.cleanup_old_images",
      targetType: "reporting-report",
      targetId: req.params.id,
      summary: "Exported and deleted old evidence images",
      details: `Exported and deleted old evidence images for submission ${req.params.submissionId}`,
      metadata: {
        submissionId: req.params.submissionId,
        deletedImageCount: result.deletedCount,
        deletedImageBytes: result.deletedBytes,
        cleanupCutoff: result.cleanupCutoff,
      },
    };

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Length", String(result.content?.length || 0));
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("X-Reporting-Deleted-Image-Count", String(result.deletedCount || 0));
    res.setHeader("X-Reporting-Deleted-Image-Bytes", String(result.deletedBytes || 0));
    const encodedFileName = encodeURIComponent(result.fileName || "reporting-evidence-cleanup.zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`
    );

    return res.send(result.content);
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function createReportingReport(req, res) {
  try {
    const report = await createReportingReportService(req.body, req.user);

    req.auditLog = {
      ...req.auditLog,
      module: "reporting",
      action: "reporting.report.create",
      targetType: "reporting-report",
      targetId: report._id.toString(),
      targetLabel: report.url,
      summary: "Created a reporting task",
      details: `Created ${report.issueType} report for ${report.url}`,
    };

    return res.status(201).json({
      success: true,
      message: "Reporting task created successfully",
      data: report,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function claimReportingReport(req, res) {
  try {
    const report = await claimReportingReportService(req.params.id, req.user);

    req.auditLog = {
      ...req.auditLog,
      module: "reporting",
      action: "reporting.report.claim",
      targetType: "reporting-report",
      targetId: report._id.toString(),
      targetLabel: report.url,
      summary: "Claimed a reporting task",
      details: `Claimed report ${report.url}`,
    };

    return res.json({
      success: true,
      message: "Reporting task claimed successfully",
      data: report,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function updateReportingTask(req, res) {
  try {
    const report = await updateReportingTaskService(req.params.id, req.body, req.user);

    req.auditLog = {
      ...req.auditLog,
      module: "reporting",
      action: "reporting.report.update",
      targetType: "reporting-report",
      targetId: report._id.toString(),
      targetLabel: report.url,
      summary: "Updated a reporting task",
      details: `Updated reporting task ${report.url}`,
    };

    return res.json({
      success: true,
      message: "Reporting task updated successfully",
      data: report,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function deleteReportingTask(req, res) {
  try {
    const report = await deleteReportingTaskService(req.params.id, req.user);

    req.auditLog = {
      ...req.auditLog,
      module: "reporting",
      action: "reporting.report.delete",
      targetType: "reporting-report",
      targetId: report._id.toString(),
      targetLabel: report.url,
      summary: "Deleted a reporting task",
      details: `Deleted reporting task ${report.url}`,
    };

    return res.json({
      success: true,
      message: "Reporting task deleted successfully",
      data: { _id: report._id.toString() },
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function updateReportingReportStatus(req, res) {
  try {
    const report = await updateReportingReportStatusService(req.params.id, req.body.status, req.user);

    req.auditLog = {
      ...req.auditLog,
      module: "reporting",
      action: "reporting.report.status-update",
      targetType: "reporting-report",
      targetId: report._id.toString(),
      targetLabel: report.url,
      summary: "Updated personal reporting status",
      details: `Changed personal status to ${req.body.status} for ${report.url}`,
    };

    return res.json({
      success: true,
      message: "Reporting task updated successfully",
      data: report,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function unclaimReportingReport(req, res) {
  try {
    const report = await unclaimReportingReportService(req.params.id, req.user);

    req.auditLog = {
      ...req.auditLog,
      module: "reporting",
      action: "reporting.report.unclaim",
      targetType: "reporting-report",
      targetId: report._id.toString(),
      targetLabel: report.url,
      summary: "Removed a reporting task from personal work",
      details: `Removed report ${report.url} from personal work`,
    };

    return res.json({
      success: true,
      message: "Reporting task removed from your work successfully",
      data: report,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function createReportingSubmission(req, res) {
  try {
    const submission = await createReportingSubmissionService(req.params.id, req.body, req.user);

    req.auditLog = {
      ...req.auditLog,
      module: "reporting",
      action: "reporting.submission.create",
      targetType: "reporting-report",
      targetId: req.params.id,
      summary: "Submitted reporting evidence",
      details: `Submitted evidence for report ${req.params.id}`,
      metadata: {
        submissionId: submission._id.toString(),
      },
    };

    return res.status(201).json({
      success: true,
      message: "Evidence submitted successfully",
      data: submission,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function updateReportingSubmission(req, res) {
  try {
    const submission = await updateReportingSubmissionService(
      req.params.id,
      req.params.submissionId,
      req.body,
      req.user
    );

    req.auditLog = {
      ...req.auditLog,
      module: "reporting",
      action: "reporting.submission.update",
      targetType: "reporting-report",
      targetId: req.params.id,
      summary: "Updated reporting evidence",
      details: `Updated evidence submission ${req.params.submissionId} for report ${req.params.id}`,
    };

    return res.json({
      success: true,
      message: "Evidence updated successfully",
      data: submission,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function deleteReportingSubmission(req, res) {
  try {
    const result = await deleteReportingSubmissionService(
      req.params.id,
      req.params.submissionId,
      req.user
    );

    req.auditLog = {
      ...req.auditLog,
      module: "reporting",
      action: "reporting.submission.delete",
      targetType: "reporting-report",
      targetId: req.params.id,
      summary: "Deleted reporting evidence",
      details: `Deleted evidence submission ${req.params.submissionId} for report ${req.params.id}`,
    };

    return res.json({
      success: true,
      message: "Evidence deleted successfully",
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function rejectReportingClaim(req, res) {
  try {
    const submission = await rejectReportingClaimService(
      req.params.id,
      req.params.reporterId,
      req.body,
      req.user
    );

    req.auditLog = {
      ...req.auditLog,
      module: "reporting",
      action: "reporting.submission.reject",
      targetType: "reporting-report",
      targetId: req.params.id,
      summary: "Rejected reporting evidence",
      details: `Rejected evidence for reporter ${req.params.reporterId} on report ${req.params.id}`,
      metadata: {
        submissionId: submission._id?.toString?.() || submission._id,
      },
    };

    return res.json({
      success: true,
      message: "Evidence rejected successfully",
      data: submission,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function updateReportingWorkflow(req, res) {
  try {
    const workflow = await updateReportingWorkflowService(req.params.issueType, req.body);

    req.auditLog = {
      ...req.auditLog,
      module: "reporting",
      action: "reporting.workflow.update",
      targetType: "reporting-workflow",
      targetId: workflow._id.toString(),
      targetLabel: workflow.title,
      summary: "Updated a reporting workflow",
      details: `Updated reporting workflow for ${workflow.issueType}`,
    };

    return res.json({
      success: true,
      message: "Reporting workflow updated successfully",
      data: workflow,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function generateReportingEmail(req, res) {
  try {
    const email = await generateReportingEmailService(req.params.id, req.body, req.user);

    req.auditLog = {
      ...req.auditLog,
      module: "reporting",
      category: "ai",
      action: "reporting.email.generate",
      targetType: "reporting-report",
      targetId: req.params.id,
      summary: "Generated an AI reporting email",
      details: `Generated AI email content for report ${req.params.id}`,
    };

    return res.json({
      success: true,
      message: "AI email content generated successfully",
      data: email,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function saveReportingEmailDraft(req, res) {
  try {
    const result = await saveReportingEmailDraftService(req.params.id, req.body, req.user);

    req.auditLog = {
      ...req.auditLog,
      module: "reporting",
      category: "email",
      action: "reporting.email.draft-save",
      targetType: "reporting-report",
      targetId: req.params.id,
      summary: "Saved a reporting email draft",
      details: `Saved reporting email draft for report ${req.params.id}`,
      metadata: {
        draftId: result.draft?._id || null,
        subject: result.draft?.subject || "",
      },
    };

    return res.json({
      success: true,
      message: "Reporting email draft saved successfully",
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function sendReportingEmail(req, res) {
  try {
    const sentEmail = await sendReportingEmailService(req.params.id, req.body, req.user);

    req.auditLog = {
      ...req.auditLog,
      module: "reporting",
      category: "email",
      action: "reporting.email.send",
      targetType: "reporting-report",
      targetId: req.params.id,
      summary: "Sent a reporting email",
      details: `Sent reporting email for report ${req.params.id}`,
      metadata: {
        to: sentEmail.to,
        subject: sentEmail.subject,
      },
    };

    return res.json({
      success: true,
      message: "Reporting email sent successfully",
      data: sentEmail,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function markReportingClaimChecked(req, res) {
  try {
    const report = await markReportingClaimCheckedService(
      req.params.id,
      req.params.reporterId,
      req.user
    );

    req.auditLog = {
      ...req.auditLog,
      module: "reporting",
      action: "reporting.claim.checked",
      targetType: "reporting-report",
      targetId: report._id.toString(),
      targetLabel: report.url,
      summary: "Checked a reporting submission",
      details: `Marked reporter ${req.params.reporterId} as checked for ${report.url}`,
    };

    return res.json({
      success: true,
      message: "Reporting submission marked as checked",
      data: report,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function getReportingTaskTracking(req, res) {
  try {
    const rows = await getReportingTaskTrackingService();

    return res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

export async function reverseReportingClaimChecked(req, res) {
  try {
    const report = await reverseReportingClaimCheckedService(
      req.params.id,
      req.params.reporterId,
      req.user
    );

    req.auditLog = {
      ...req.auditLog,
      module: "reporting",
      action: "reporting.claim.unchecked",
      targetType: "reporting-report",
      targetId: report._id.toString(),
      targetLabel: report.url,
      summary: "Reversed a checked reporting submission",
      details: `Reversed checked state for reporter ${req.params.reporterId} on ${report.url}`,
    };

    return res.json({
      success: true,
      message: "Reporting submission review reversed",
      data: report,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}
