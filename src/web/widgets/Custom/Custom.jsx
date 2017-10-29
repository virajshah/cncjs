import get from 'lodash/get';
import Uri from 'jsuri';
import pubsub from 'pubsub-js';
import PropTypes from 'prop-types';
import React, { PureComponent } from 'react';
import ReactDOM from 'react-dom';
import store from '../../store';
import Iframe from '../../components/Iframe';
import controller from '../../lib/controller';
import i18n from '../../lib/i18n';
import log from '../../lib/log';
import styles from './index.styl';

class Custom extends PureComponent {
    static propTypes = {
        config: PropTypes.object,
        disabled: PropTypes.bool,
        url: PropTypes.string,
        connection: PropTypes.object
    };

    pubsubTokens = [];
    iframe = null;
    observer = null;
    timer = null;

    componentDidMount() {
        this.subscribe();
    }
    componentWillUnmount() {
        this.unsubscribe();
    }
    componentWillReceiveProps(nextProps) {
        if (nextProps.url !== this.props.url) {
            this.reload();
        }
        if (nextProps.connection.ident !== this.props.connection.ident) {
            // Post a message to the iframe window
            this.postMessage('change', {
                controller: controller.type,
                connection: { ...controller.connection }
            });

            // Detect iframe content height change every 100ms, but shorter than 2000ms
            this.timer = setInterval(() => {
                this.resize();
            }, 100);
            setTimeout(() => {
                if (this.timer) {
                    clearInterval(this.timer);
                    this.timer = null;
                }
            }, 2000);
        }
    }
    subscribe() {
        const tokens = [
            pubsub.subscribe('message:connect', () => {
                // Post a message to the iframe window
                this.postMessage('change', {
                    controller: {
                        type: controller.type
                    },
                    connection: {
                        ident: controller.connection.ident,
                        type: controller.connection.type,
                        settings: controller.connection.settings
                    }
                });
            })
        ];
        this.pubsubTokens = this.pubsubTokens.concat(tokens);
    }
    unsubscribe() {
        this.pubsubTokens.forEach((token) => {
            pubsub.unsubscribe(token);
        });
        this.pubsubTokens = [];
    }
    postMessage(type = '', payload) {
        const token = store.get('session.token');
        const target = get(this.iframe, 'contentWindow');
        const message = {
            token: token,
            action: {
                type: type,
                payload: {
                    ...payload
                }
            }
        };

        if (target) {
            target.postMessage(message, '*');
        }
    }
    reload(forceGet = false) {
        if (this.iframe) {
            const { url } = this.props;
            const token = store.get('session.token');
            this.iframe.src = new Uri(url)
                .addQueryParam('token', token)
                .toString();

            try {
                // Reload
                this.iframe.contentWindow.location.reload(forceGet);
            } catch (err) {
                // Catch DOMException when accessing the 'contentDocument' property from a cross-origin frame
                log.error(err);
            }
        }
    }
    resize() {
        if (!this.iframe) {
            return;
        }

        try {
            const target = this.iframe.contentDocument.body;
            if (!target) {
                return;
            }

            // Recalculate the height of the content
            this.iframe.style.height = 0;
            const nextHeight = target.scrollHeight;
            this.iframe.style.height = `${nextHeight}px`;
        } catch (err) {
            // Catch DOMException when accessing the 'contentDocument' property from a cross-origin frame
            log.error(err);
        }
    }
    render() {
        const { disabled, url } = this.props;

        if (!url) {
            return (
                <div className={styles.inactiveContent}>
                    {i18n._('URL not configured')}
                </div>
            );
        }

        if (disabled) {
            return (
                <div className={styles.inactiveContent}>
                    {i18n._('The widget is currently disabled')}
                </div>
            );
        }

        const token = store.get('session.token');
        const iframeSrc = new Uri(url)
            .addQueryParam('token', token)
            .toString();

        return (
            <Iframe
                ref={node => {
                    if (this.observer) {
                        this.observer.disconnect();
                        this.observer = null;
                    }

                    if (!node) {
                        this.iframe = null;
                        return;
                    }

                    this.iframe = ReactDOM.findDOMNode(node);
                    this.iframe.addEventListener('load', () => {
                        try {
                            const target = this.iframe.contentDocument.body;
                            const config = {
                                attributes: true,
                                attributeOldValue: false,
                                characterData: true,
                                characterDataOldValue: false,
                                childList: true,
                                subtree: true
                            };

                            this.resize();

                            this.observer = new MutationObserver(mutations => {
                                this.resize();
                            });
                            this.observer.observe(target, config);
                        } catch (err) {
                            // Catch DOMException when accessing the 'contentDocument' property from a cross-origin frame
                            log.error(err);
                        }
                    });
                }}
                src={iframeSrc}
                style={{
                    verticalAlign: 'top'
                }}
            />
        );
    }
}

export default Custom;
