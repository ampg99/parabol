import {DashboardAvatars_team} from '../../__generated__/DashboardAvatars_team.graphql'
import React from 'react'
import styled from '@emotion/styled'
import {createFragmentContainer} from 'react-relay'
import graphql from 'babel-plugin-relay/macro'
import AddTeamMemberAvatarButton from '../AddTeamMemberAvatarButton'
import DashboardAvatar from './DashboardAvatar'
import ErrorBoundary from '../ErrorBoundary'
import {Breakpoint} from 'types/constEnums'

const dashboardBreakpoint = `@media screen and (min-width: ${Breakpoint.SIDEBAR_LEFT}px)`

const AvatarsList = styled('div')({
  display: 'flex',
  overflow: 'auto',
  maxWidth: '100%',
  [dashboardBreakpoint]: {
    overflow: 'visible'
  }
})

const ItemBlock = styled('div')({
  marginRight: 8,
  position: 'relative',
  [dashboardBreakpoint]: {
    marginBottom: 8,
    marginLeft: 8,
    marginRight: 0
  }
})

interface Props {
  team: DashboardAvatars_team
}

const DashboardAvatars = (props: Props) => {
  const {team} = props
  const {id: teamId, isLead: isViewerLead, teamMembers} = team
  return (
    <AvatarsList>
      <ItemBlock>
        <AddTeamMemberAvatarButton teamId={teamId} teamMembers={teamMembers} />
      </ItemBlock>
      {teamMembers.map((teamMember) => {
        return (
          <ItemBlock key={`dbAvatar${teamMember.id}`}>
            <ErrorBoundary>
              <DashboardAvatar isViewerLead={isViewerLead} teamMember={teamMember} />
            </ErrorBoundary>
          </ItemBlock>
        )
      })}
    </AvatarsList>
  )
}

export default createFragmentContainer(DashboardAvatars, {
  team: graphql`
    fragment DashboardAvatars_team on Team {
      id
      isLead
      teamMembers(sortBy: "preferredName") {
        ...AddTeamMemberAvatarButton_teamMembers
        ...DashboardAvatar_teamMember
        id
      }
    }
  `
})
