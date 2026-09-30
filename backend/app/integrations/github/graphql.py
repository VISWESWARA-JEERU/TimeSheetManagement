PROJECT_STATUS_FIELDS = """
query ProjectStatusFields($projectId: ID!) {
  node(id: $projectId) {
    ... on ProjectV2 {
      fields(first: 100) {
        nodes {
          __typename
          ... on ProjectV2SingleSelectField {
            id
            name
            options {
              id
              name
            }
          }
        }
      }
    }
  }
}
"""

PROJECT_ITEMS = """
query ProjectItems($projectId: ID!, $after: String) {
  node(id: $projectId) {
    ... on ProjectV2 {
      items(first: 50, after: $after) {
        nodes {
          id
          project {
            id
          }
          fieldValues(first: 20) {
            nodes {
              __typename
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
                field {
                  ... on ProjectV2SingleSelectField {
                    name
                  }
                }
              }
            }
          }
          content {
            __typename
            ... on Issue {
              id
              title
              body
              number
              url
              updatedAt
              repository {
                nameWithOwner
              }
              assignees(first: 20) {
                nodes {
                  login
                }
              }
            }
            ... on PullRequest {
              id
              title
              body
              number
              url
              updatedAt
              repository {
                nameWithOwner
              }
              assignees(first: 20) {
                nodes {
                  login
                }
              }
            }
            ... on DraftIssue {
              id
              title
              body
              updatedAt
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
}
"""

PROJECT_ITEM = """
query ProjectItem($itemId: ID!) {
  node(id: $itemId) {
    ... on ProjectV2Item {
      id
      project {
        id
      }
      fieldValues(first: 20) {
        nodes {
          __typename
          ... on ProjectV2ItemFieldSingleSelectValue {
            name
            field {
              ... on ProjectV2SingleSelectField {
                name
              }
            }
          }
        }
      }
      content {
        __typename
        ... on Issue {
          id
          title
          body
          number
          url
          updatedAt
          repository {
            nameWithOwner
          }
          assignees(first: 20) {
            nodes {
              login
            }
          }
        }
        ... on PullRequest {
          id
          title
          body
          number
          url
          updatedAt
          repository {
            nameWithOwner
          }
          assignees(first: 20) {
            nodes {
              login
            }
          }
        }
        ... on DraftIssue {
          id
          title
          body
          updatedAt
        }
      }
    }
  }
}
"""

UPDATE_STATUS = """
mutation UpdateProjectItemStatus(
  $projectId: ID!,
  $itemId: ID!,
  $fieldId: ID!,
  $optionId: String!
) {
  updateProjectV2ItemFieldValue(input: {
    projectId: $projectId,
    itemId: $itemId,
    fieldId: $fieldId,
    value: { singleSelectOptionId: $optionId }
  }) {
    projectV2Item {
      id
    }
  }
}
"""

UPDATE_ISSUE_BODY = """
mutation UpdateIssueBody($id: ID!, $body: String!) {
  updateIssue(input: { issueId: $id, body: $body }) {
    issue {
      id
      updatedAt
    }
  }
}
"""

UPDATE_PULL_REQUEST_BODY = """
mutation UpdatePullRequestBody($id: ID!, $body: String!) {
  updatePullRequest(input: { pullRequestId: $id, body: $body }) {
    pullRequest {
      id
      updatedAt
    }
  }
}
"""

UPDATE_DRAFT_BODY = """
mutation UpdateDraftIssueBody($id: ID!, $body: String!) {
  updateProjectV2DraftIssue(input: { draftIssueId: $id, body: $body }) {
    draftIssue {
      id
      updatedAt
    }
  }
}
"""
