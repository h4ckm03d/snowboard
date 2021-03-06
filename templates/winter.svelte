<script>
  import { onMount } from "svelte";
  import qs from "querystringify";

  import MenuPanel from "./winter/panels/MenuPanel.svelte";
  import RequestPanel from "./winter/panels/RequestPanel.svelte";
  import ResponsePanel from "./winter/panels/ResponsePanel.svelte";
  import ParameterPanel from "./winter/panels/ParameterPanel.svelte";
  import SelectorPanel from "./winter/panels/SelectorPanel.svelte";
  import PlaygroundPanel from "./winter/panels/PlaygroundPanel.svelte";
  import ScenarioPanel from "./winter/panels/ScenarioPanel.svelte";

  import {
    toc,
    markdown,
    highlight,
    stringify,
    colorize,
    clearPKCE,
    clearState,
    setToken,
    setRefreshToken,
    getToken,
    getPKCE,
    exchangeToken,
    isAuth,
    isPKCE,
    pushHistory,
    basePath,
    getEnv,
    slugify
  } from "./winter/util.js";

  import { env, auth, token } from "./winter/store.js";

  export let title;
  export let description;
  export let actions;
  export let tagActions;
  export let config;

  let index = -1;
  let challengePair = getPKCE();

  function handleClick(event) {
    let target = event.target;

    if (target.nodeName == "SPAN") {
      target = target.parentElement;
    }

    const slug = target.dataset["slug"];
    index = actions.findIndex(el => el.slug === slug);
    document.body.scrollTop = document.documentElement.scrollTop = 0;
  }

  function handlePopstate() {
    const hash = location.hash;
    const prevIndex = index;
    let isDetail = false;
    if (hash.match("#/")) {
      let slug = hash.replace("#/", "");
      switch (true) {
        case slug.startsWith("g~"):
          const groupSlug = slug.substr(2);
          const firstAction = firstGroupAction(groupSlug);

          if (firstAction) {
            slug = firstAction.slug;
            query = `g:${groupSlug}`;
          }

          break;
        case slug.startsWith("rg~"):
          const tagSlug = slug.substr(3);
          const firstGroup = firstTagGroup(tagSlug);

          if (firstGroup) {
            const firstAction = firstGroupAction(
              `${tagSlug}~${slugify(firstGroup.title)}`
            );

            if (firstAction) {
              slug = firstAction.slug;
              query = `rg:${tagSlug}`;
            }
          }
          break;
        default:
          isDetail = true;
          break;
      }
      index = actions.findIndex(el => el.slug === slug);
      // sync group
      if (
        isDetail &&
        !slug.startsWith("rg~") &&
        (query !== "" || prevIndex === -1) &&
        actions[index].tags.length > 1
      ) {
        query = `g:${slugify(actions[index].tags[0])}~${slugify(
          actions[index].tags[1]
        )}`;
      }
    } else {
      query = "";
      index = -1;
    }
  }

  function handleTagClick(event) {
    const tagSlug = event.target.dataset["slug"];
    const firstGroup = firstTagGroup(tagSlug);

    if (firstGroup) {
      const firstAction = firstGroupAction(
        `${tagSlug}~${slugify(firstGroup.title)}`
      );
      const slug = firstAction.slug;

      index = actions.findIndex(el => el.slug === slug);
      query = `rg:${tagSlug}`;
      document.body.scrollTop = document.documentElement.scrollTop = 0;
    }
  }

  function firstTagGroup(tagSlug) {
    let matches = [];

    tagActions.forEach(tag => {
      if (slugify(tag.title) === tagSlug) {
        matches.push(tag);
      }
    });

    if (matches.length > 0) {
      return matches[0].children[0];
    }
  }

  function handleGroupClick(event) {
    const slug = event.target.dataset["slug"];
    const firstAction = firstGroupAction(slug);

    if (firstAction) {
      const slug = firstAction.slug;
      index = actions.findIndex(el => el.slug === slug);
      query = `g:${slug}`;
      document.body.scrollTop = document.documentElement.scrollTop = 0;
    }
  }

  function firstGroupAction(groupSlug) {
    let matches = [];
    const slugs = groupSlug.split("~");
    tagActions.forEach(tag => {
      matches = matches.concat(
        tag.children.filter(
          child =>
            slugify(child.title) === slugs[1] && slugify(tag.title) === slugs[0]
        )
      );
    });

    if (matches.length > 0) {
      return matches[0].actions[0];
    }
  }

  function tocClick(event) {
    index = -1;
    let href = event.target.getAttribute("href");
    pushHistory(href);
  }

  $: {
    document.title =
      (currentAction && `${currentAction.title} - ${title}`) || title;
  }

  $: groupTransactionsFunc = action => {
    if (typeof action === "undefined") {
      return undefined;
    }
    let data = Object.assign({}, action);
    data.groupedTransactions = [];
    data.transactions.forEach(transaction => {
      let title = transaction.request.title;
      let foundIndex = null;
      data.groupedTransactions.forEach((transaction, index) => {
        if (foundIndex === null && transaction.request.title === title) {
          foundIndex = index;
        }
      });
      if (foundIndex === null) {
        data.groupedTransactions.push({
          request: transaction.request,
          responses: [transaction.response]
        });
      } else {
        data.groupedTransactions[foundIndex].responses.push(
          transaction.response
        );
      }
    });
    return data;
  };
  $: transformedAction = groupTransactionsFunc(actions[index]);

  $: currentAction = actions[index];
  $: environment =
    config.playground.enabled && config.playground.environments[$env];

  if (config.playground.enabled) {
    const savedEnv = getEnv();

    if (
      savedEnv &&
      Object.keys(config.playground.environments).includes(savedEnv)
    ) {
      env.set(savedEnv);
    } else {
      env.set(config.playground.env);
    }

    const authToken = getToken($env);

    if (authToken) {
      auth.add($env);
      token.set(authToken);
    }
  }

  let showMenu = true;
  let collapsed = false;
  let authenticating = false;
  let query = "";

  function burgerClick() {
    showMenu = !showMenu;
  }

  function collapseToggle() {
    collapsed = !collapsed;
  }

  function searchClick() {
    collapseToggle();

    const searchInput = document.getElementById("search-input-text");
    if (searchInput) {
      searchInput.focus();
    }
  }

  function sample(action) {
    return action.transactions[0].request;
  }

  function headersMap(action) {
    return sample(action)
      .headers.filter(header => header.name != "Authorization")
      .map(header => {
        return {
          used: true,
          required: false,
          name: header.name,
          value: header.example || ""
        };
      });
  }

  function authHeader(action, environment) {
    const header = sample(action).headers.find(
      header => header.name === "Authorization"
    );

    header.value = header.example;
    header.used = true;

    if (isAuth(environment, "basic")) {
      header.value = `Basic ${basicAuth(
        environment.auth.options.username,
        environment.auth.options.password
      )}`;
    }

    if (isAuth(environment, "apikey")) {
      header.name = environment.auth.options.header;
      header.value = environment.auth.options.key;
    }

    if (isAuth(environment, "oauth2")) {
      if ($auth.split(";").includes($env)) {
        header.value = `Bearer ${$token}`;
      }
    }

    return header;
  }

  function parametersMap(action) {
    return action.parameters.map(param => {
      return {
        used: param.required,
        required: param.required,
        name: param.name,
        value: param.example || ""
      };
    });
  }

  function bodyMap(action) {
    const example = sample(action).example;
    return stringify(example);
  }

  const darkMode = {
    enable: true,
    store: window.localStorage,
    toggle: "darkmode-toggle",
    mode: ["light", "dark"],
    active: false
  };

  function darkToggle() {
    darkMode.active = !darkMode.active;
    document.getElementById(
      `bulma-theme-${darkMode.mode[Number(!darkMode.active)]}`
    ).media = "none";
    document.getElementById(
      `bulma-theme-${darkMode.mode[Number(darkMode.active)]}`
    ).media = "";
    darkMode.store.setItem(
      darkMode.toggle,
      darkMode.mode[Number(darkMode.active)]
    );
  }

  if (darkMode.store.getItem(darkMode.toggle) === darkMode.mode[1]) {
    darkToggle();
  }

  onMount(async () => {
    // handle oauth2 callback
    if (isAuth(environment, "oauth2")) {
      const authParam = qs.parse(location.search);

      if (authParam.code) {
        authenticating = true;

        pushHistory(basePath(config));

        const { accessToken, refreshToken } = await exchangeToken(
          authParam.code,
          environment.auth.options,
          isPKCE(environment),
          challengePair
        );

        if (accessToken) {
          setToken($env, accessToken);
          auth.add($env);
          token.set(accessToken);

          if (refreshToken) {
            setRefreshToken($env, refreshToken);
          }
        }

        authenticating = false;
        clearPKCE();
        clearState();
      }
    }

    // handle permalink
    const hash = location.hash;

    if (hash.match("#/")) {
      let slug = hash.replace("#/", "");

      if (slug.startsWith("g~")) {
        const groupSlug = slug.substr(3 + currentAction.tags[0].length);
        const firstAction = firstGroupAction(groupSlug);

        if (firstAction) {
          slug = firstAction.slug;
          query = `g:${currentAction.tags[0]}~${groupSlug}`;
        }
      }

      if (slug.startsWith("rg~")) {
        const tagSlug = slug.substr(3);
        const firstGroup = firstTagGroup(tagSlug);

        if (firstGroup) {
          const firstAction = firstGroupAction(slugify(firstGroup.title));

          if (firstAction) {
            slug = firstAction.slug;
            query = `rg:${tagSlug}`;
          }
        }
      }

      index = actions.findIndex(el => el.slug === slug);
    }
  });

  document.onkeyup = function(e) {
    if ((e.which || e.keyCode) == 219) {
      collapseToggle();
    }
  };
</script>

<style>
  :global(html) {
    height: 100%;
  }

  :global(body) {
    min-height: 100%;
  }

  .sidenav {
    padding: 1rem 0 1rem 0.75rem;
  }

  .main {
    padding: 3rem;
    background-color: #fff;
    box-shadow: 0 2px 0 2px #f5f5f5;
  }

  .main.is-darkmode {
    background-color: #000;
    box-shadow: 0 2px 0 2px #363636;
  }

  .breadcrumb-right {
    margin-top: 0.3em;
  }

  .box-wrapper {
    border-radius: 0;
  }

  .body-inner {
    min-height: 100vh;
    background-color: #fafafa;
  }

  .body-inner.is-darkmode {
    background-color: #000;
  }

  :global(.is-darkmode .input, .is-darkmode .select select, .is-darkmode
      .textarea) {
    background-color: #484848;
    border-color: #484848;
    color: #fff;
  }

  :global(.is-darkmode .input:hover, .is-darkmode
      .is-hovered.input, .is-darkmode .is-hovered.textarea, .is-darkmode
      .select
      select.is-hovered, .is-darkmode .select select:hover, .is-darkmode
      .textarea:hover) {
    border-color: #666;
  }

  :global(.is-darkmode .select select.is-focused, .is-darkmode
      .select
      select:active, .is-darkmode .select select:focus, .is-darkmode
      .textarea:active, .is-darkmode .textarea:focus) {
    border-color: #888;
  }

  :global(.is-darkmode .input::placeholder, .is-darkmode
      .select
      select::placeholder, .is-darkmode .textarea::placeholder) {
    color: #ccc;
  }

  :global(code[class*="language-"], pre[class*="language-"]) {
    font-family: monospace;
  }

  :global(.token.number, .token.tag) {
    display: inline;
    padding: inherit;
    font-size: inherit;
    line-height: inherit;
    text-align: inherit;
    vertical-align: inherit;
    border-radius: inherit;
    font-weight: inherit;
    white-space: inherit;
    background: inherit;
    margin: inherit;
  }

  .icon-brand {
    margin-right: 0.5rem;
  }

  .menu-collapsible {
    display: none;
    position: fixed;
    width: calc(25% - 0.5rem);
    height: calc(2.5rem + 10px);
    left: 0;
    bottom: 0;
    font-size: 1.33333em;
    line-height: calc(2.5rem + 5px);
    text-align: center;
    color: #b5b5b5;
    font-weight: 300;
    border-top: 1px solid #eee;
    box-shadow: 2px 0 0 #f5f5f5;
    cursor: pointer;
  }

  .menu-collapsible:hover {
    background: rgba(0, 0, 0, 0.05);
    box-shadow: 2px 0 0 #eee;
    border-color: #e8e8e8;
  }

  .menu-collapsible.is-darkmode {
    border-color: #363636;
    box-shadow: 2px 0 0 #363636;
  }

  .menu-collapsible.is-darkmode:hover {
    background: rgba(255, 255, 255, 0.2);
    border-color: #363636;
    box-shadow: 2px 0 0 #363636;
  }

  .footer.is-darkmode {
    background-color: #000;
  }

  .footer .content {
    transition: margin 0.3s;
  }

  @media screen and (min-width: 768px) {
    .menu-collapsible {
      display: block;
    }

    .is-collapsed .sidenav {
      width: 3.75rem;
    }

    .is-collapsed .main {
      width: calc(100% - 4.5rem);
    }

    .is-collapsed .menu-collapsible {
      width: calc(3rem - 2px);
    }

    .menu-collapsible,
    .sidenav,
    .main {
      transition: width 0.3s;
    }
  }
</style>

<div class="body-inner" class:is-darkmode={darkMode.active}>
  <nav
    class="navbar is-fixed-top has-shadow"
    role="navigation"
    aria-label="main navigation">
    <div class="navbar-brand">
      <a href="/" class="navbar-item">
        <span class="icon icon-brand is-medium has-text-grey-light">
          <i class="fas fa-lg fa-chalkboard" />
        </span>
        <span class="title is-4">{title}</span>
      </a>

      <a
        href="javascript:void(0)"
        on:click={burgerClick}
        role="button"
        class="navbar-burger"
        aria-label="menu"
        aria-expanded="false"
        data-target="mainnav">
        <span aria-hidden="true" />
        <span aria-hidden="true" />
        <span aria-hidden="true" />
      </a>
    </div>

    <div class="navbar-menu">
      <div class="navbar-end">
        {#if config.playground.enabled}
          <SelectorPanel
            environments={config.playground.environments}
            pkceChallenge={challengePair}
            {authenticating} />
        {/if}
        {#if darkMode.enable}
          <div class="navbar-item has-dropdown is-hoverable">
            <a
              href="javascript:void(0)"
              on:click={darkToggle}
              title="Dark Mode"
              class="navbar-link is-arrowless">
              <span class="icon is-medium has-text-grey-light">
                <i
                  class="fas fa-lg"
                  class:fa-moon={darkMode.active}
                  class:fa-sun={!darkMode.active} />
              </span>
            </a>
          </div>
        {/if}
      </div>
    </div>
  </nav>

  <div class="columns" class:is-collapsed={collapsed}>
    <div
      class="column is-one-quarter sidenav"
      class:is-hidden-mobile={showMenu}
      id="mainnav">
      <MenuPanel
        {title}
        {tagActions}
        tagHeaders={toc(description)}
        currentSlug={currentAction && currentAction.slug}
        actionsCount={actions.length}
        isCollapsed={collapsed}
        isDarkmode={darkMode.active}
        {query}
        {config}
        {handleClick}
        {handleGroupClick}
        {handlePopstate}
        {handleTagClick}
        {tocClick}
        {searchClick} />
      <div
        class="menu-collapsible"
        class:is-darkmode={darkMode.active}
        on:click={collapseToggle}>
        {#if collapsed}
          <span class="icon" title="Expand [">&raquo;</span>
        {/if}
        {#if !collapsed}
          <span class="icon">&laquo;</span>
          <span class="fa-xs">Collapse sidebar</span>
        {/if}
      </div>
    </div>

    <div
      class="column is-three-quarters main"
      class:is-darkmode={darkMode.active}>
      {#if index === -1}
        <div class="content">
          {@html markdown(description)}
        </div>
      {/if}

      {#if currentAction}
        <div class="columns">
          <div class="column">
            <h1 class="title is-4">{currentAction.title}</h1>
          </div>
          <div class="column">
            <nav
              class="breadcrumb breadcrumb-right is-pulled-right"
              aria-label="breadcrumbs">
              <ul>
                {#each currentAction.tags as tag, index}
                  <li>
                    {#if index === 0}
                      <a href="javascript:void(0)">{tag}</a>
                    {:else}
                      <a
                        data-slug="{slugify(currentAction.tags[0])}~{slugify(tag)}"
                        href="#/g~{slugify(currentAction.tags[0])}~{slugify(tag)}"
                        on:click={handleGroupClick}>
                        {tag}
                      </a>
                    {/if}
                  </li>
                {/each}
              </ul>
            </nav>
          </div>
        </div>

        <hr />

        <div class="tags has-addons are-large">
          <code class="tag is-uppercase {colorize(currentAction.method)}">
            {currentAction.method}
          </code>
          <code class="tag ">{currentAction.pathTemplate}</code>
        </div>

        <div class="content">
          {@html markdown(currentAction.description)}
        </div>

        {#if config.playground.enabled}
          {#if environment.playground !== false}
            <PlaygroundPanel
              {currentAction}
              pkceChallenge={challengePair}
              environments={config.playground.environments}
              requestHeaders={headersMap(currentAction)}
              requestAuthHeader={authHeader(currentAction, environment)}
              requestParameters={parametersMap(currentAction)}
              requestBody={bodyMap(currentAction)}
              isDarkmode={darkMode.active} />
          {/if}
        {/if}

        <ParameterPanel parameters={currentAction.parameters} />

        {#each transformedAction.groupedTransactions as { request, responses }, index}
          <ScenarioPanel
            show={index === 0}
            isDarkmode={darkMode.active}
            {request}
            {responses}
            {index}
            count={transformedAction.groupedTransactions.length} />
        {/each}
      {/if}
    </div>
  </div>
  <footer class="footer" class:is-darkmode={darkMode.active}>
    <div
      class="content column is-paddingless has-text-centered"
      class:is-offset-one-quarter={!collapsed}>
      <p>
        <strong>{title}</strong>
        powered by
        <a href="https://github.com/bukalapak/snowboard" target="_blank">
          <strong>Snowboard.</strong>
        </a>
      </p>
    </div>
  </footer>
</div>
