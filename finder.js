const path = require('path');
const React = require('react');
const gitGrep = require('git-grep');
const gitBlame = require('git-blame');
const { render, Color, Static, Box } = require('ink');

class Finder extends React.Component {
  constructor(props) {
    super(props);
    const projectPath = path.resolve(path.join(__dirname, '../../neo/ounass'));
    const repoPath = path.join(projectPath, '.git');

    this.state = {
      projectPath,
      repoPath,
      comments: {
        raw: {},
        prepared: {}
      },
    };

    this.handleError = this.handleError.bind(this);
    this.onCommentFound = this.onCommentFound.bind(this);
    this.onBlameFound = this.onBlameFound.bind(this);
    this.renderComment = this.renderComment.bind(this);
    this.normalizeComment = this.normalizeComment.bind(this);
  }

  setStateComment(key, hash, comment) {
    this.setState(state => ({
      ...state,
      comments: {
        ...state.comments,
        [key]: {
          ...state.comments[key],
          [hash]: {
            ...(state.comments[key][hash] || {}),
            ...comment
          }
        }
      }
    }));
  }

  onBlameFound(rawHash, type, blame) {
    this.setStateComment('prepared', `${rawHash}${blame.hash}`, blame);
  }

  onCommentFound(comment) {
    let { file, line, text } = comment;
    text = text.replace(/\s*$/, '');

    const hash = encodeURI(`${file}${line}${text}`);
    this.setStateComment('raw', hash, comment);

    // Get the commit details and date for when this comment was added
    gitBlame(this.state.repoPath, { file, limitLines: `${comment.line},${comment.line}`, })
      .on('data', (type, blame) => this.onBlameFound(hash, type, blame))
      .on('error', this.handleError)
      .on('end', () => null);
  }

  handleError(err) {
    console.log(err);
  }

  loadComments() {
    gitGrep(this.state.repoPath, { rev: 'HEAD', term: '((TODO)|(FIXME)|(TESTME)|(DOCME))' })
      .on('data', this.onCommentFound)
      .on('error', this.handleError)
      .on('end', () => null);
  }

  componentDidMount() {
    this.loadComments();
  }

  normalizeComment(content) {
    // Remove the spaces from both ends of the comment
    let normalizedComment = (content || '')
      .replace(/^\s+/, '')
      .replace(/\s+$/, '');

    // List of comment expressions
    const commentRegexList = [
      { start: /^.*?\/\/\s*/, end: null, comment: '//' },
      { start: /^.*?#\s*/, end: null, comment: '#' },
      { start: /^.*?\/*\s*/, end: /\s*\*\}\s*$/, comment: '/*' },
      { start: /^.*?\{\s*\/\*\s*/, end: /\*\/\s*\}\s*$/, comment: '{/*' },
    ];

    let applicableRegex = null;
    let earliestPosition = -1;

    // Git blame might give the code on line before the comment i.e.
    // in the cases when the todo comment has been left in front of
    // the line of code. Here we iterate and find the type of comment
    // applied to the given line of code
    commentRegexList.forEach(commentRegex => {
      // The position where the comment starts
      const matchPosition = normalizedComment.indexOf(commentRegex.comment);
      if (matchPosition === -1) {
        return;
      }

      // We have got a position before and
      // this comment lies after the position that we have, ignore
      if (earliestPosition !== -1 && matchPosition > earliestPosition) {
        return;
      }

      // If this matched comment lies before the last comment match, take this
      earliestPosition = matchPosition;
      applicableRegex = commentRegex;
    });

    // No matching comment was found
    if (!applicableRegex) {
      return normalizedComment;
    }

    if (applicableRegex.start) {
      normalizedComment = normalizedComment.replace(applicableRegex.start, '');
    }

    if (applicableRegex.end) {
      normalizedComment = normalizedComment.replace(applicableRegex.end, '');
    }

    return normalizedComment;
  }

  renderComment(hash) {
    const comment = this.state.comments.prepared[hash];
    const author = comment.author || {};

    return (
      <Box key={hash} green>
        <Box width={20} marginRight={1} textWrap="truncate">
          <Color yellow>{author.name || ''}</Color>
        </Box>
        <Box flexGrow={1}>
          {this.normalizeComment(comment.content)}
        </Box>
      </Box>
    )
  }

  renderLoading() {
    return (
      <React.Fragment>
        <Color yellow>{Object.keys(this.state.comments.raw).length} comments found</Color>
        {<Color green>Loading ...</Color>}
      </React.Fragment>
    );
  }

  render() {
    const rawComments = this.state.comments.raw;
    const preparedComments = this.state.comments.prepared;
    const commentsLoaded = Object.keys(rawComments).length === Object.keys(preparedComments).length;

    if (!commentsLoaded) {
      return this.renderLoading();
    }

    return (
      <Static>{Object.keys(preparedComments).map(this.renderComment)}</Static>
    );
  }
}

render(<Finder/>);