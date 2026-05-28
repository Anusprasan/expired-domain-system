import {
  acceptReportingTaskService,
  createReportingTaskFromTelegramService,
  createReportingTaskService,
  deleteReportingTaskService,
  getReportingTaskStaffService,
  getReportingTaskEvidenceImageService,
  getReportingTasksService,
  submitReportingTaskDdosEvidenceService,
  submitReportingTaskEvidenceService,
  updateReportingTaskService,
} from "./reportingTask.service.js";

export async function createReportingTaskFromTelegram(req, res) {
  try {
    const result = await createReportingTaskFromTelegramService({
      botId: req.params.botId,
      update: req.body,
    });

    return res.json({
      success: true,
      message: result.task ? "Reporting task created from Telegram" : "Telegram help sent",
      data: result.task,
    });
  } catch (error) {
    return res.status(200).json({ success: false, message: error.message });
  }
}

export async function getReportingTasks(req, res) {
  try {
    const tasks = await getReportingTasksService(req.query.date || null);
    return res.json({ success: true, data: tasks });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function createReportingTask(req, res) {
  try {
    const task = await createReportingTaskService(req.body, req.user);

    req.auditLog = {
      ...req.auditLog,
      module: "reporting-tasks",
      action: "reporting-task.create",
      targetType: "reporting-task",
      targetId: task._id.toString(),
      targetLabel: task.url,
      summary: "Created a reporting task",
      details: `Created reporting task for ${task.url}`,
    };

    return res.status(201).json({
      success: true,
      message: "Reporting task created successfully",
      data: task,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function acceptReportingTask(req, res) {
  try {
    const task = await acceptReportingTaskService(req.params.id, req.user);

    req.auditLog = {
      ...req.auditLog,
      module: "reporting-tasks",
      action: "reporting-task.accept",
      targetType: "reporting-task",
      targetId: task._id.toString(),
      targetLabel: task.url,
      summary: "Accepted a reporting task",
      details: `Accepted reporting task for ${task.url}`,
    };

    return res.json({
      success: true,
      message: "Task accepted successfully",
      data: task,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function submitReportingTaskEvidence(req, res) {
  try {
    const task = await submitReportingTaskEvidenceService(req.params.id, req.body, req.files || [], req.user);

    req.auditLog = {
      ...req.auditLog,
      module: "reporting-tasks",
      action: "reporting-task.evidence",
      targetType: "reporting-task",
      targetId: task._id.toString(),
      targetLabel: task.url,
      summary: "Submitted evidence for a reporting task",
      details: `Submitted evidence for reporting task ${task.url}`,
    };

    return res.json({
      success: true,
      message: "Evidence submitted successfully",
      data: task,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function submitReportingTaskDdosEvidence(req, res) {
  try {
    const task = await submitReportingTaskDdosEvidenceService(req.params.id, req.body, req.files || [], req.user);

    req.auditLog = {
      ...req.auditLog,
      module: "reporting-tasks",
      action: "reporting-task.ddos-evidence",
      targetType: "reporting-task",
      targetId: task._id.toString(),
      targetLabel: task.url,
      summary: "Submitted DDoS evidence for a reporting task",
      details: `Submitted DDoS screenshots for reporting task ${task.url}`,
    };

    return res.json({
      success: true,
      message: "DDoS evidence submitted successfully",
      data: task,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function updateReportingTask(req, res) {
  try {
    const task = await updateReportingTaskService(req.params.id, req.body, req.user);

    req.auditLog = {
      ...req.auditLog,
      module: "reporting-tasks",
      action: "reporting-task.update",
      targetType: "reporting-task",
      targetId: task._id.toString(),
      targetLabel: task.url,
      summary: "Updated a reporting task",
      details: `Updated reporting task for ${task.url}`,
    };

    return res.json({
      success: true,
      message: "Reporting task updated successfully",
      data: task,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function deleteReportingTask(req, res) {
  try {
    const result = await deleteReportingTaskService(req.params.id, req.user);

    req.auditLog = {
      ...req.auditLog,
      module: "reporting-tasks",
      action: "reporting-task.delete",
      targetType: "reporting-task",
      targetId: result._id.toString(),
      summary: "Deleted a reporting task",
    };

    return res.json({
      success: true,
      message: "Reporting task deleted successfully",
      data: result,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function getReportingTaskStaff(req, res) {
  try {
    const staff = await getReportingTaskStaffService();
    return res.json({ success: true, data: staff });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function getReportingTaskEvidenceImage(req, res) {
  try {
    const result = await getReportingTaskEvidenceImageService(req.params.id, req.params.imageId, req.user);
    const image = result.image;
    const disposition = req.query.download === "1" ? "attachment" : "inline";
    const safeName = String(image.name || "evidence-image").replace(/["\r\n]/g, "");

    res.setHeader("Content-Type", image.contentType || result.object?.ContentType || "application/octet-stream");
    res.setHeader("Content-Disposition", `${disposition}; filename="${safeName}"`);
    res.setHeader("Cache-Control", "private, max-age=300");

    if (result.legacyBase64) {
      return res.send(Buffer.from(result.legacyBase64, "base64"));
    }

    if (result.object?.ContentLength) {
      res.setHeader("Content-Length", String(result.object.ContentLength));
    }

    return result.object.Body.pipe(res);
  } catch (error) {
    return res.status(404).json({ success: false, message: error.message });
  }
}
