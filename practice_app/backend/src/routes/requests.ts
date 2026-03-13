import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const prisma = new PrismaClient();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { isAllocated } = req.query;

    const where: Record<string, unknown> = {};
    if (isAllocated !== undefined) {
      where.isAllocated = isAllocated === 'true';
    }

    const requests = await prisma.workRequest.findMany({
      where,
      include: { assignee: true },
      orderBy: { allocationStartDate: 'asc' },
    });

    res.json(requests);
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

    const request = await prisma.workRequest.create({
      data: {
        id: uuidv4(),
        title,
        description,
        source,
        sourceDetail,
        type,
        priority,
        status,
        isDraft,
        effort,
        dateRaised: dateRaised ? new Date(dateRaised) : new Date(),
        dateResolved: dateResolved ? new Date(dateResolved) : undefined,
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
      include: { assignee: true },
    });

    res.status(201).json(request);
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

    const request = await prisma.workRequest.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(source !== undefined && { source }),
        ...(sourceDetail !== undefined && { sourceDetail }),
        ...(type !== undefined && { type }),
        ...(priority !== undefined && { priority }),
        ...(status !== undefined && { status }),
        ...(isDraft !== undefined && { isDraft }),
        ...(effort !== undefined && { effort }),
        ...(dateRaised !== undefined && { dateRaised: new Date(dateRaised) }),
        ...(dateResolved !== undefined && {
          dateResolved: dateResolved ? new Date(dateResolved) : null,
        }),
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
      include: { assignee: true },
    });

    res.json(request);
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
