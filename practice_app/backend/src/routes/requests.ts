import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const prisma = new PrismaClient();

router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      isAllocated,
      isDraft,
      source,
      type,
      priority,
      status,
      assigneeId,
      from,
      to,
      raisedFrom,
      raisedTo,
      q,
    } = req.query;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {};

    if (isAllocated !== undefined) where.isAllocated = isAllocated === 'true';
    if (isDraft !== undefined) where.isDraft = isDraft === 'true';
    if (source) where.source = { in: String(source).split(',') };
    if (type) where.type = { in: String(type).split(',') };
    if (priority) where.priority = { in: String(priority).split(',') };
    if (status) where.status = { in: String(status).split(',') };
    if (assigneeId) where.assigneeId = { in: String(assigneeId).split(',') };

    // Timeline range filter (allocation dates)
    if (from || to) {
      if (from) where.allocationEndDate = { gte: new Date(String(from)) };
      if (to) where.allocationStartDate = { lte: new Date(String(to)) };
    }

    // Date raised range filter
    if (raisedFrom || raisedTo) {
      where.dateRaised = {};
      if (raisedFrom) where.dateRaised.gte = new Date(String(raisedFrom));
      if (raisedTo) where.dateRaised.lte = new Date(String(raisedTo));
    }

    // Free-text search across title, description, externalRef, tags
    if (q) {
      const search = String(q);
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
        { externalRef: { contains: search } },
        { tags: { contains: search } },
        { requestor: { name: { contains: search } } },
        { requestor: { team: { contains: search } } },
      ];
    }

    const orderBy = isAllocated === 'true'
      ? { allocationStartDate: 'asc' as const }
      : { dateRaised: 'desc' as const };

    const requests = await prisma.workRequest.findMany({
      where,
      include: { assignee: true, requestor: true },
      orderBy,
    });

    // Deserialise JSON string fields
    const result = requests.map((r) => ({
      ...r,
      tags: (() => { try { return JSON.parse(r.tags); } catch { return []; } })(),
      dimensionNodeIds: (() => { try { return JSON.parse(r.dimensionNodeIds); } catch { return []; } })(),
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      title,
      description,
      source = 'planning',
      sourceDetail,
      type = 'other',
      priority = 'medium',
      status = 'new',
      isDraft = false,
      effort,
      dateRaised,
      dateResolved,
      requestorId,
      assigneeId,
      isAllocated = false,
      allocationType,
      allocationStartDate,
      allocationEndDate,
      allocationNotes,
      noteRef,
      tags = '[]',
      externalRef,
      dimensionNodeIds = '[]',
      notes,
    } = req.body;

    // Auto-advance status to in-flight when allocating
    let resolvedStatus = status;
    if (isAllocated && (status === 'new' || status === 'assessed')) {
      resolvedStatus = 'in-flight';
    }

    const request = await prisma.workRequest.create({
      data: {
        id: uuidv4(),
        title,
        description,
        source,
        sourceDetail,
        type,
        priority,
        status: resolvedStatus,
        isDraft,
        effort,
        dateRaised: dateRaised ? new Date(dateRaised) : new Date(),
        dateResolved: dateResolved ? new Date(dateResolved) : undefined,
        requestorId: requestorId || undefined,
        assigneeId: assigneeId || undefined,
        isAllocated,
        allocationType,
        allocationStartDate: allocationStartDate ? new Date(allocationStartDate) : undefined,
        allocationEndDate: allocationEndDate ? new Date(allocationEndDate) : undefined,
        allocationNotes,
        noteRef,
        tags: Array.isArray(tags) ? JSON.stringify(tags) : tags,
        externalRef,
        dimensionNodeIds: Array.isArray(dimensionNodeIds)
          ? JSON.stringify(dimensionNodeIds)
          : dimensionNodeIds,
        notes,
      },
      include: { assignee: true, requestor: true },
    });

    res.status(201).json({
      ...request,
      tags: (() => { try { return JSON.parse(request.tags); } catch { return []; } })(),
      dimensionNodeIds: (() => { try { return JSON.parse(request.dimensionNodeIds); } catch { return []; } })(),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const {
      title,
      description,
      source,
      sourceDetail,
      type,
      priority,
      status,
      isDraft,
      effort,
      dateRaised,
      dateResolved,
      requestorId,
      assigneeId,
      isAllocated,
      allocationType,
      allocationStartDate,
      allocationEndDate,
      allocationNotes,
      noteRef,
      tags,
      externalRef,
      dimensionNodeIds,
      notes,
    } = req.body;

    // Auto-advance status when allocating
    let resolvedStatus = status;
    if (isAllocated === true && (status === 'new' || status === 'assessed')) {
      resolvedStatus = 'in-flight';
    } else if (isAllocated === true && status === undefined) {
      // Check current status and auto-advance if needed
      const current = await prisma.workRequest.findUnique({ where: { id }, select: { status: true } });
      if (current && (current.status === 'new' || current.status === 'assessed')) {
        resolvedStatus = 'in-flight';
      }
    }

    const request = await prisma.workRequest.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(source !== undefined && { source }),
        ...(sourceDetail !== undefined && { sourceDetail }),
        ...(type !== undefined && { type }),
        ...(priority !== undefined && { priority }),
        ...((resolvedStatus !== undefined) && { status: resolvedStatus }),
        ...(isDraft !== undefined && { isDraft }),
        ...(effort !== undefined && { effort }),
        ...(dateRaised !== undefined && { dateRaised: new Date(dateRaised) }),
        ...(dateResolved !== undefined && {
          dateResolved: dateResolved ? new Date(dateResolved) : null,
        }),
        ...(requestorId !== undefined && { requestorId: requestorId || null }),
        ...(assigneeId !== undefined && { assigneeId: assigneeId || null }),
        ...(isAllocated !== undefined && { isAllocated }),
        ...(allocationType !== undefined && { allocationType }),
        ...(allocationStartDate !== undefined && {
          allocationStartDate: allocationStartDate ? new Date(allocationStartDate) : null,
        }),
        ...(allocationEndDate !== undefined && {
          allocationEndDate: allocationEndDate ? new Date(allocationEndDate) : null,
        }),
        ...(allocationNotes !== undefined && { allocationNotes }),
        ...(noteRef !== undefined && { noteRef }),
        ...(tags !== undefined && {
          tags: Array.isArray(tags) ? JSON.stringify(tags) : tags,
        }),
        ...(externalRef !== undefined && { externalRef }),
        ...(dimensionNodeIds !== undefined && {
          dimensionNodeIds: Array.isArray(dimensionNodeIds)
            ? JSON.stringify(dimensionNodeIds)
            : dimensionNodeIds,
        }),
        ...(notes !== undefined && { notes }),
      },
      include: { assignee: true, requestor: true },
    });

    res.json({
      ...request,
      tags: (() => { try { return JSON.parse(request.tags); } catch { return []; } })(),
      dimensionNodeIds: (() => { try { return JSON.parse(request.dimensionNodeIds); } catch { return []; } })(),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    await prisma.workRequest.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;

