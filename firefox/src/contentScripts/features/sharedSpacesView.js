(() => {
  const createAvatar = ({ url = '', label = '', className = '' }) => {
    const avatar = url ? document.createElement('img') : document.createElement('span');
    avatar.className = className;
    if (url) {
      avatar.src = url;
      avatar.alt = '';
      avatar.referrerPolicy = 'no-referrer';
    } else {
      avatar.textContent = String(label || '?').trim().slice(0, 1).toUpperCase();
    }
    return avatar;
  };

  const renderMemberGallery = ({ space, permissions, t, onRoleChange }) => {
    const gallery = document.createElement('div');
    gallery.className = 'tfr-shared-members__gallery';
    (space?.members || []).forEach((member) => {
      const card = document.createElement('div');
      card.className = `tfr-shared-members__row is-${member.role}`;
      card.tabIndex = 0;
      const avatar = createAvatar({ url: member.avatarUrl, label: member.displayName, className: 'tfr-shared-members__avatar' });
      const identity = document.createElement('div'); identity.className = 'tfr-shared-members__identity';
      const name = document.createElement('strong'); name.textContent = member.displayName;
      const roleLabel = document.createElement('small'); roleLabel.textContent = t(`sharedSpaces.role.${member.role}`);
      identity.append(name, roleLabel);
      const roleSelect = document.createElement('select');
      ['editor', 'viewer'].forEach((roleId) => {
        const option = document.createElement('option'); option.value = roleId; option.textContent = t(`sharedSpaces.role.${roleId}`);
        roleSelect.appendChild(option);
      });
      if (member.role === 'owner') {
        const ownerOption = document.createElement('option');
        ownerOption.value = 'owner'; ownerOption.textContent = t('sharedSpaces.role.owner');
        roleSelect.prepend(ownerOption);
      }
      roleSelect.value = member.role;
      roleSelect.disabled = !permissions.manageMembers || member.id === space.ownerId;
      roleSelect.addEventListener('change', () => onRoleChange(member, roleSelect.value));
      const tooltip = document.createElement('div'); tooltip.className = 'tfr-shared-members__tooltip'; tooltip.setAttribute('role', 'tooltip');
      const tooltipName = document.createElement('strong'); tooltipName.textContent = member.displayName;
      const tooltipRole = document.createElement('span'); tooltipRole.textContent = t('sharedSpaces.memberRoleInfo', { role: t(`sharedSpaces.role.${member.role}`) });
      const tooltipAccess = document.createElement('small'); tooltipAccess.textContent = t(`sharedSpaces.memberAccess.${member.role}`);
      tooltip.append(tooltipName, tooltipRole, tooltipAccess);
      card.append(avatar, identity, roleSelect, tooltip);
      gallery.appendChild(card);
    });
    return gallery;
  };

  const renderInvitationInbox = ({ invitations, t, onRespond, onRefresh = () => {} }) => {
    const list = document.createElement('section'); list.className = 'tfr-shared-invitations';
    const header = document.createElement('div'); header.className = 'tfr-shared-invitations__header';
    const title = document.createElement('strong'); title.textContent = t('sharedSpaces.remote.inboxTitle');
    const count = document.createElement('span'); count.className = 'tfr-shared-invitations__count'; count.textContent = String(invitations.length);
    const headerActions = document.createElement('div'); headerActions.className = 'tfr-shared-invitations__header-actions';
    const refresh = document.createElement('button'); refresh.type = 'button'; refresh.className = 'tfr-button tfr-button--ghost';
    refresh.textContent = t('sharedSpaces.remote.refreshInvitations');
    refresh.addEventListener('click', async () => {
      refresh.disabled = true;
      try { await onRefresh(); } finally { refresh.disabled = false; }
    });
    headerActions.append(count, refresh); header.append(title, headerActions); list.appendChild(header);
    if (!invitations.length) {
      const empty = document.createElement('div'); empty.className = 'tfr-shared-invitations__empty';
      const icon = document.createElement('span'); icon.className = 'tfr-shared-invitations__empty-icon'; icon.textContent = '✉'; icon.setAttribute('aria-hidden', 'true');
      const copy = document.createElement('div');
      const heading = document.createElement('strong'); heading.textContent = t('sharedSpaces.remote.inboxEmpty');
      const hint = document.createElement('small'); hint.textContent = t('sharedSpaces.remote.inboxEmptyHint');
      copy.append(heading, hint); empty.append(icon, copy); list.appendChild(empty);
    }
    invitations.forEach((item) => {
      const row = document.createElement('article'); row.className = 'tfr-shared-invitations__row';
      const avatar = createAvatar({ url: item.invitedByAvatarUrl, label: item.invitedBy || item.spaceName, className: 'tfr-shared-invitations__avatar' });
      const content = document.createElement('div'); content.className = 'tfr-shared-invitations__content';
      const sender = document.createElement('strong'); sender.textContent = t('sharedSpaces.remote.invitationFrom', { name: item.invitedBy || 'Twitch' });
      const text = document.createElement('span'); text.textContent = t('sharedSpaces.remote.invitationText', { space: item.spaceName });
      const role = document.createElement('small'); role.textContent = t('sharedSpaces.remote.invitationRole', { role: t(`sharedSpaces.role.${item.role}`) });
      content.append(sender, text, role);
      const actions = document.createElement('div'); actions.className = 'tfr-shared-invitations__actions';
      ['accept', 'decline'].forEach((action) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'tfr-button tfr-button--ghost';
        if (action === 'accept') button.classList.add('tfr-button--primary');
        button.textContent = t(`sharedSpaces.remote.${action}`);
        button.addEventListener('click', () => {
          actions.querySelectorAll('button').forEach((control) => { control.disabled = true; });
          onRespond(item, action === 'accept');
        });
        actions.appendChild(button);
      });
      row.append(avatar, content, actions); list.appendChild(row);
    });
    return list;
  };

  window.TFRSharedSpacesView = Object.freeze({ createAvatar, renderMemberGallery, renderInvitationInbox });
})();
