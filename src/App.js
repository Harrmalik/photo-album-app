import React, { Component } from 'react';
import aws_exports from './aws-exports';
import { withAuthenticator } from 'aws-amplify-react';
import { Connect } from 'aws-amplify-react';
import Amplify, { API, graphqlOperation } from 'aws-amplify';
import { Grid, Header, Input, List, Segment } from 'semantic-ui-react';
Amplify.configure(aws_exports);

// 2. NEW: Create a function we can use to
//    sort an array of objects by a common property
function makeComparator(key, order='asc') {
  return (a, b) => {
    if(!a.hasOwnProperty(key) || !b.hasOwnProperty(key)) return 0;

    const aVal = (typeof a[key] === 'string') ? a[key].toUpperCase() : a[key];
    const bVal = (typeof b[key] === 'string') ? b[key].toUpperCase() : b[key];

    let comparison = 0;
    if (aVal > bVal) comparison = 1;
    if (aVal < bVal) comparison = -1;

    return order === 'desc' ? (comparison * -1) : comparison
  };
}

// 3. NEW: Add an AlbumsList component for rendering
//    a sorted list of album names
class AlbumsList extends React.Component {
  albumItems() {
        return this.props.albums.sort(makeComparator('name')).map(album =>
            <li key={album.id}>
                {album.name}
            </li>);
    }

  render() {
    return (
      <Segment>
        <Header as='h3'>My Albums</Header>
        <List divided relaxed>
          {this.albumItems()}
        </List>
      </Segment>
    );
  }
}

// 4. NEW: Add a new string to query all albums
const ListAlbums = `query ListAlbums {
    listAlbums(limit: 9999) {
        items {
            id
            name
        }
    }
}`;

const SubscribeToNewAlbums = `
  subscription OnCreateAlbum {
    onCreateAlbum {
      id
      name
    }
  }
`;

// 5. NEW: Add an AlbumsListLoader component that will use the
//    Connect component from Amplify to provide data to AlbumsList
// 2. EDIT: Update AlbumsListLoader to work with subscriptions
class AlbumsListLoader extends React.Component {

    // 2a. NEW: add a onNewAlbum() function
    // for handling subscription events
    onNewAlbum = (prevQuery, newData) => {
        // When we get data about a new album,
        // we need to put in into an object
        // with the same shape as the original query results,
        // but with the new data added as well
        let updatedQuery = Object.assign({}, prevQuery);
        updatedQuery.listAlbums.items = prevQuery.listAlbums.items.concat([newData.onCreateAlbum]);
        return updatedQuery;
    }

    render() {
        return (
            <Connect
                query={graphqlOperation(ListAlbums)}

                // 2b. NEW: Listen to our
                // SubscribeToNewAlbums subscription
                subscription={graphqlOperation(SubscribeToNewAlbums)}
                // 2c. NEW: Handle new subscription messages
                onSubscriptionMsg={this.onNewAlbum}
            >

                {({ data, loading, errors }) => {
                    if (loading) { return <div>Loading...</div>; }
                    if (errors.length > 0) { return <div>{JSON.stringify(errors)}</div>; }
                    if (!data.listAlbums) return;

                return <AlbumsList albums={data.listAlbums.items} />;
                }}
            </Connect>
        );
    }
}

// 2. NEW: Create a NewAlbum component to give us
//    a way of saving new albums
class NewAlbum extends Component {
  constructor(props) {
    super(props);
    this.state = {
      albumName: ''
     };
   }

  handleChange = (event) => {
    let change = {};
    change[event.target.name] = event.target.value;
    this.setState(change);
  }

  handleSubmit = async (event) => {
    event.preventDefault();
    const NewAlbum = `mutation NewAlbum($name: String!) {
      createAlbum(input: {name: $name}) {
        id
        name
      }
    }`;

    const result = await API.graphql(graphqlOperation(NewAlbum, { name: this.state.albumName }));
    console.info(`Created album with id ${result.data.createAlbum.id}`);
  }

  render() {
    return (
      <Segment>
        <Header as='h3'>Add a new album</Header>
         <Input
          type='text'
          placeholder='New Album Name'
          icon='plus'
          iconPosition='left'
          action={{ content: 'Create', onClick: this.handleSubmit }}
          name='albumName'
          value={this.state.albumName}
          onChange={this.handleChange}
         />
        </Segment>
      )
   }
}

// 6. EDIT: Change the App component to look nicer and
//    use the AlbumsListLoader component
class App extends Component {
  render() {
    return (
      <Grid padded>
        <Grid.Column>
          <NewAlbum />
          <AlbumsListLoader />
        </Grid.Column>
      </Grid>
    );
  }
}

export default withAuthenticator(App, {includeGreetings: true});
