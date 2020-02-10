import fromTeamMemberId from '../../../../client/utils/relay/fromTeamMemberId'
import getRethink from '../../../database/rethinkDriver'
import CheckInStage from '../../../database/types/CheckInStage'
import NotificationKickedOut from '../../../database/types/NotificationKickedOut'
import Task from '../../../database/types/Task'
import UpdatesStage from '../../../database/types/UpdatesStage'
import User from '../../../database/types/User'
import archiveTasksForDB from '../../../safeMutations/archiveTasksForDB'
import {DataLoaderWorker} from '../../graphql'
import removeStagesFromMeetings from './removeStagesFromMeetings'

interface Options {
  evictorUserId?: string
}

const removeTeamMember = async (
  teamMemberId: string,
  options: Options,
  dataLoader: DataLoaderWorker
) => {
  const {evictorUserId} = options
  const r = await getRethink()
  const now = new Date()
  const {userId, teamId} = fromTeamMemberId(teamMemberId)
  // see if they were a leader, make a new guy leader so later we can reassign tasks
  const activeTeamMembers = await r
    .table('TeamMember')
    .getAll(teamId, {index: 'teamId'})
    .run()
  const teamMember = activeTeamMembers.find((t) => t.id === teamMemberId)!
  const {isLead, isNotRemoved} = teamMember
  // if the guy being removed is the leader & not the last, pick a new one. else, use him
  const teamLeader = activeTeamMembers.find((t) => t.isLead === !isLead) || teamMember
  if (!isNotRemoved) {
    throw new Error('Team member already removed')
  }

  if (activeTeamMembers.length === 1) {
    // archive single-person teams
    await r
      .table('Team')
      .get(teamId)
      .update({isArchived: true})
      .run()
  } else if (isLead) {
    // assign new leader, remove old leader flag
    await r({
      newTeamLead: r
        .table('TeamMember')
        .get(teamLeader.id)
        .update({
          isLead: true
        }),
      oldTeamLead: r
        .table('TeamMember')
        .get(teamMemberId)
        .update({isLead: false})
    }).run()
  }

  // assign active tasks to the team lead
  const {integratedTasksToArchive, reassignedTasks, user} = await r({
    teamMember: r
      .table('TeamMember')
      .get(teamMemberId)
      .update({
        isNotRemoved: false,
        updatedAt: now
      }),
    integratedTasksToArchive: (r
      .table('Task')
      .getAll(teamMemberId, {index: 'assigneeId'})
      .filter((task) => {
        return r.and(
          task('tags')
            .contains('archived')
            .not(),
          task('integrations')
            .default(null)
            .ne(null)
        )
      })
      .coerceTo('array') as unknown) as Task[],
    reassignedTasks: (r
      .table('Task')
      .getAll(teamMemberId, {index: 'assigneeId'})
      .filter((task) =>
        r.and(
          task('tags')
            .contains('archived')
            .not(),
          task('integrations')
            .default(null)
            .eq(null)
        )
      )
      .update(
        {
          assigneeId: teamLeader.id,
          userId: teamLeader.userId
        },
        {returnChanges: true}
      )('changes')('new_val')
      .default([]) as unknown) as Task[],
    user: (r
      .table('User')
      .get(userId)
      .update(
        (myUser) => ({
          tms: myUser('tms').difference([teamId])
        }),
        {returnChanges: true}
      )('changes')(0)('new_val')
      .default(null) as unknown) as User,
    // not adjusting atlassian, if they join the team again, they'll be ready to go
    changedProviders: r
      .table('Provider')
      .getAll(teamId, {index: 'teamId'})
      .filter({userId, isActive: true})
      .update(
        {
          isActive: false
        },
        {returnChanges: true}
      )('changes')('new_val')
      .default([])
  }).run()

  let notificationId
  if (evictorUserId) {
    const notification = new NotificationKickedOut({teamId, userId, evictorUserId})
    notificationId = notification.id
    await r
      .table('Notification')
      .insert(notification)
      .run()
  }

  const archivedTasks = await archiveTasksForDB(integratedTasksToArchive)
  const archivedTaskIds = archivedTasks.map(({id}) => id)

  // if a new meeting was currently running, remove them from it
  const filterFn = (stage: CheckInStage | UpdatesStage) => {
    return stage.teamMemberId === teamMemberId
  }
  await removeStagesFromMeetings(filterFn, teamId, dataLoader)

  // TODO should probably just inactivate the meeting member
  const activeMeetings = await dataLoader.get('activeMeetingsByTeamId').load(teamId)
  const meetingIds = activeMeetings.map(({id}) => id)
  await r
    .table('MeetingMember')
    .getAll(r.args(meetingIds), {index: 'meetingId'})
    .filter({userId})
    .delete()
    .run()
  return {
    user,
    notificationId,
    archivedTaskIds,
    reassignedTaskIds: reassignedTasks.map(({id}) => id)
  }
}

export default removeTeamMember
